package com.yeskiy.yreview.tasks

import com.intellij.concurrency.SensitiveProgressWrapper
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressIndicatorProvider
import com.intellij.openapi.progress.ProgressManager
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/** Runs reads at the same time and gives the answers in the input order. The caller runs each read that no thread started. */
object ParallelReads {

    private const val THREADS = 4

    private const val SLICE_MILLIS = 20L

    private val pool = AppExecutorUtil.createBoundedApplicationPoolExecutor("y-review reads", THREADS)

    fun <T, R> map(items: List<T>, checkCanceled: () -> Unit, read: (T) -> R): List<R> {
        if (items.size < 2) return items.map(read)
        val parent = ProgressIndicatorProvider.getGlobalProgressIndicator()
        val tasks = items.map { item -> FutureTask { under(parent) { read(item) } } }
        tasks.forEach(pool::execute)
        try {
            return tasks.map { await(it, checkCanceled) }
        } finally {
            tasks.forEach { it.cancel(true) }
        }
    }

    /** A read on a pool thread sees the cancel of the scan that started it. */
    private fun <R> under(parent: ProgressIndicator?, read: () -> R): R =
        if (parent == null) read() else ProgressManager.getInstance().runProcess<R>({ read() }, SensitiveProgressWrapper(parent))

    /** After each slice the caller runs the read itself if no pool thread started it, so a full pool cannot deadlock. */
    private fun <R> await(task: FutureTask<R>, checkCanceled: () -> Unit): R {
        while (true) {
            checkCanceled()
            try {
                return task.get(SLICE_MILLIS, TimeUnit.MILLISECONDS)
            } catch (wait: TimeoutException) {
                task.run()
            } catch (failed: ExecutionException) {
                throw failed.cause ?: failed
            }
        }
    }
}
