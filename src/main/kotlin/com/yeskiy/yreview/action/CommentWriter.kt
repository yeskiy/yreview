package com.yeskiy.yreview.action

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.ui.ShareFailure

/** Writes one comment of the popup, and tells the user when the write or the push fails. */
object CommentWriter {

    const val TITLE = "Add Review Comment"

    fun write(project: Project, root: VirtualFile, commit: String, target: Target, text: String, share: Boolean) {
        try {
            ReviewService.getInstance(project).addComment(
                root,
                NoteRefs.refFor(share),
                commit,
                target.path,
                target.startLine,
                target.endLine,
                text,
            ).shareError?.let { ShareFailure.report(project, TITLE, it) }
        } catch (failure: NotesWriteException) {
            Messages.showErrorDialog(project, failure.message ?: "The comment was not written.", TITLE)
        }
    }
}
