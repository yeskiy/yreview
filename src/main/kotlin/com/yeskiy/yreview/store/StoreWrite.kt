package com.yeskiy.yreview.store

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.ThrowableComputable

/**
 * Runs one write of the store away from the thread that draws the window.
 *
 * A write starts git twice. It reads the address of the author, and it appends the record.
 * A process start on the thread that draws the window holds that thread for the whole run,
 * so the window paints nothing until git ends. The progress window runs the work on
 * another thread, and the user sees that work runs.
 *
 * A caller that already stands off that thread runs the work as it is. The answer and
 * every failure reach the caller on both paths, so no report of a failed write gets lost.
 */
object StoreWrite {

    fun <T> run(project: Project, title: String, work: () -> T): T {
        val task = ThrowableComputable<T, RuntimeException> { work() }
        if (!ApplicationManager.getApplication().isDispatchThread) return task.compute()
        return ProgressManager.getInstance().runProcessWithProgressSynchronously(task, title, true, project)
    }
}
