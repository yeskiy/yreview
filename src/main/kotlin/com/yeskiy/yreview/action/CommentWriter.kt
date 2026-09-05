package com.yeskiy.yreview.action

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtil
import com.yeskiy.yreview.settings.FolderNoticeLog
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewAnchor
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreWrite
import com.yeskiy.yreview.ui.ReviewNotice
import com.yeskiy.yreview.ui.ShareFailure
import java.nio.file.Path

/**
 * Writes one comment of the popup, and tells the user when the write or the push fails.
 *
 * Every caller presses a button, so every caller stands on the thread that draws the
 * window. Git therefore runs under a progress window, and the answer comes back before the
 * notice, so the tree and the messages keep their order.
 */
object CommentWriter {

    const val TITLE = "Add Review Comment"

    /** The words of the progress window that runs git while the comment reaches the store. */
    const val PROGRESS = "Writing the Review Comment"

    /** Returns true after the comment reaches the store. A write that fails tells the user. */
    fun write(project: Project, anchor: ReviewAnchor, target: Target, text: String, share: Boolean): Boolean {
        val firstFolderWrite = anchor.kind == StoreKind.FOLDER &&
            !FolderNoticeLog.getInstance(project).told(anchor.root.path)
        try {
            StoreWrite.run(project, PROGRESS) {
                ReviewService.getInstance(project)
                    .addComment(anchor, NoteRefs.refFor(share), target.startLine, target.endLine, text)
            }.shareError?.let { ShareFailure.report(project, TITLE, it) }
        } catch (failure: NotesWriteException) {
            Messages.showErrorDialog(project, failure.message ?: "The comment was not written.", TITLE)
            return false
        }
        if (firstFolderWrite) tellAboutFolder(project, anchor)
        return true
    }

    /** The folder is new to the user, so the plugin says where the comments went and why. */
    private fun tellAboutFolder(project: Project, anchor: ReviewAnchor) {
        FolderNoticeLog.getInstance(project).markTold(anchor.root.path)
        VfsUtil.markDirtyAndRefresh(true, true, false, Path.of(anchor.root.path, FolderStore.FOLDER))
        ReviewNotice.say(
            project,
            "No git repository covers this file. The review comments go to " +
                "${anchor.root.path}/${FolderStore.FOLDER}. The plugin moves them into the git notes " +
                "by itself after a repository with a commit exists here.",
        )
    }
}
