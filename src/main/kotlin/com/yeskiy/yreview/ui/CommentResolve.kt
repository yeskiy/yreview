package com.yeskiy.yreview.ui

import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.CommentWriteResult
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment

/** Marks one review comment as resolved. Git runs under a progress window, off the user interface thread. */
object CommentResolve {

    const val TITLE = "Review Comment"

    fun run(project: Project, root: VirtualFile, stored: StoredComment) {
        try {
            write(project, root, stored).shareError?.let { ShareFailure.report(project, TITLE, it) }
        } catch (failure: NotesWriteException) {
            Messages.showErrorDialog(project, failure.message ?: "The comment was not resolved.", TITLE)
        }
    }

    private fun write(project: Project, root: VirtualFile, stored: StoredComment): CommentWriteResult =
        ProgressManager.getInstance().runProcessWithProgressSynchronously(
            ThrowableComputable<CommentWriteResult, NotesWriteException> {
                ReviewService.getInstance(project).resolveComment(root, stored)
            },
            "Resolving the Review Comment",
            true,
            project,
        )
}
