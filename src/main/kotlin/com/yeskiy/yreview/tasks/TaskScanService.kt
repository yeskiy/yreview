package com.yeskiy.yreview.tasks

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicLong

/** One scan result of the whole project per resolved switch, shared by the tabs. A result is used only while its generation and stamp hold. */
@Service(Service.Level.PROJECT)
class TaskScanService(private val project: Project) : Disposable {

    private class Shared(
        val generation: Long,
        val stamp: ScanStamp,
        val indicator: ProgressIndicator,
        val result: CompletableFuture<List<RepositoryTasks>>,
    )

    private val generation = AtomicLong()

    private val scans = ConcurrentHashMap<Boolean, Shared>()

    /** A signal that can change any task calls this, so the next read scans again. */
    fun invalidate() {
        generation.incrementAndGet()
    }

    /** The caller runs off the EDT. A shared scan that another read canceled gives this read a new scan. */
    fun read(showResolved: Boolean, checkCanceled: () -> Unit): List<RepositoryTasks> {
        val now = generation.get()
        val stamp = ScanStamp.of(project)
        val shared = scans.compute(showResolved) { _, old ->
            old?.takeIf { it.generation == now && it.stamp.matches(stamp) && !it.result.isCompletedExceptionally }
                ?: start(now, stamp, showResolved).also { old?.indicator?.cancel() }
        }!!
        return await(shared.result, checkCanceled) ?: read(showResolved, checkCanceled)
    }

    private fun start(now: Long, stamp: ScanStamp, showResolved: Boolean): Shared {
        val indicator = EmptyProgressIndicator()
        val result = CompletableFuture<List<RepositoryTasks>>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                result.complete(ProgressManager.getInstance().runProcess<List<RepositoryTasks>>({ TaskScan.read(project, null, showResolved) }, indicator))
            } catch (failure: Throwable) {
                result.completeExceptionally(failure)
            }
        }
        return Shared(now, stamp, indicator, result)
    }

    /** Null when the shared scan was canceled and this caller was not. */
    private fun <T> await(result: CompletableFuture<T>, checkCanceled: () -> Unit): T? {
        while (true) {
            checkCanceled()
            try {
                return result.get(SLICE_MILLIS, TimeUnit.MILLISECONDS)
            } catch (wait: TimeoutException) {
                continue
            } catch (canceled: CancellationException) {
                // The get call throws a canceled scan as it is, so only the check of this caller can end the read.
                return checkCanceled().let { null }
            } catch (failed: ExecutionException) {
                throw failed.cause ?: failed
            }
        }
    }

    override fun dispose() = scans.values.forEach { it.indicator.cancel() }

    companion object {
        private const val SLICE_MILLIS = 20L

        fun getInstance(project: Project): TaskScanService = project.service()
    }
}
