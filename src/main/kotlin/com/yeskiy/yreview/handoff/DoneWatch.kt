package com.yeskiy.yreview.handoff

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import com.yeskiy.yreview.tasks.CloseReport
import com.yeskiy.yreview.tasks.TaskCompletion
import com.yeskiy.yreview.tasks.TaskLabels
import com.yeskiy.yreview.ui.ReviewNotice
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Watches the done files of the project and closes every task an agent reports.
 *
 * The watch starts after the first send and stops when the project closes. The reader
 * keeps a read position, so the plugin never reads the same line twice and never deletes
 * the file.
 */
@Service(Service.Level.PROJECT)
class DoneWatch(private val project: Project) : Disposable {

    private val logs = ConcurrentHashMap<String, DoneLog>()

    private val busy = AtomicBoolean(false)

    private val lock = Any()

    private var future: ScheduledFuture<*>? = null

    fun watch(files: HandoffFiles) {
        logs.computeIfAbsent(files.done.toString()) { DoneLog(files.done) }
        synchronized(lock) {
            if (future != null) return
            future = AppExecutorUtil.getAppScheduledExecutorService()
                .scheduleWithFixedDelay(::tick, DELAY_SECONDS, DELAY_SECONDS, TimeUnit.SECONDS)
        }
    }

    override fun dispose() {
        synchronized(lock) {
            future?.cancel(false)
            future = null
        }
        logs.clear()
    }

    private fun tick() {
        if (project.isDisposed) return
        if (!busy.compareAndSet(false, true)) return
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                collect()
            } catch (failure: RuntimeException) {
                logger.warn("the review plugin could not read a done file", failure)
            } finally {
                busy.set(false)
            }
        }
    }

    private fun collect() {
        if (project.isDisposed) return
        val ids = logs.values.flatMap { log -> runCatching { log.newIds() }.getOrDefault(emptyList()) }
        if (ids.isEmpty()) return
        val report = TaskCompletion.getInstance(project).close(ids)
        if (report.quiet) return
        announce(report)
    }

    /** A line that closed nothing stays quiet, because a restart reads the whole file again. */
    private fun announce(report: CloseReport) {
        val text = "An agent finished ${TaskLabels.count(report.closed, "task")}."
        ApplicationManager.getApplication().invokeLater({
            val problem = report.problem
            if (problem == null) ReviewNotice.say(project, text) else ReviewNotice.warn(project, "$text $problem")
        }, project.disposed)
    }

    companion object {
        private const val DELAY_SECONDS = 3L

        private val logger = logger<DoneWatch>()

        fun getInstance(project: Project): DoneWatch = project.service()
    }
}
