package com.yeskiy.yreview.gutter

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.ui.ShareFailure
import java.awt.event.MouseEvent

/** Opens the comments of one gutter icon and offers the resolve control. */
object CommentPopup {

    fun show(project: Project, root: VirtualFile, event: MouseEvent, comments: List<StoredComment>) {
        val single = comments.singleOrNull()
        if (single != null) {
            askResolve(project, root, single)
            return
        }
        JBPopupFactory.getInstance()
            .createPopupChooserBuilder(comments)
            .setTitle("Review Comments")
            .setRenderer(textListCellRenderer<StoredComment> { summary(it) })
            .setItemChosenCallback { askResolve(project, root, it) }
            .createPopup()
            .show(RelativePoint(event))
    }

    fun summary(stored: StoredComment): String {
        val range = stored.comment.location?.range
        val head = stored.comment.description?.lineSequence()?.firstOrNull().orEmpty()
        return "${range?.startLine}-${range?.endLine}: $head"
    }

    private fun askResolve(project: Project, root: VirtualFile, stored: StoredComment) {
        val answer = Messages.showYesNoDialog(project, body(stored), TITLE, "Resolve", "Close", null)
        if (answer != Messages.YES) return
        val result = ReviewService.getInstance(project).resolveComment(root, stored)
        result.shareError?.let { ShareFailure.report(project, TITLE, it) }
    }

    private fun body(stored: StoredComment): String {
        val location = stored.comment.location
        val range = location?.range
        val where = if (NoteRefs.isShared(stored.ref)) "shared" else "local"
        return "${location?.path}:${range?.startLine}-${range?.endLine} @${location?.commit?.take(7)}\n" +
            "${stored.comment.author}, $where\n\n" +
            stored.comment.description.orEmpty()
    }

    private const val TITLE = "Review Comment"
}
