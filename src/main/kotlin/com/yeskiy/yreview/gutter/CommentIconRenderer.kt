package com.yeskiy.yreview.gutter

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.awt.RelativePoint
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.ui.CommentText
import com.yeskiy.yreview.ui.ViewCommentPopup
import icons.CollaborationToolsIcons
import java.awt.event.MouseEvent
import javax.swing.Icon

/** The speech bubble of the platform code review. One icon stands for one comment range. */
class CommentIconRenderer(
    private val project: Project,
    private val root: VirtualFile,
    private val comments: List<StoredComment>,
) : GutterIconRenderer() {

    override fun getIcon(): Icon = CollaborationToolsIcons.Comment

    override fun getAlignment(): Alignment = Alignment.LEFT

    override fun getTooltipText(): String = comments.joinToString("\n\n") { CommentText.summary(it) }

    override fun getAccessibleName(): String = "Review comment"

    override fun getClickAction(): AnAction = DumbAwareAction.create { open(it) }

    override fun equals(other: Any?): Boolean =
        other is CommentIconRenderer && other.root == root && other.comments == comments

    override fun hashCode(): Int = 31 * root.hashCode() + comments.hashCode()

    private fun open(event: AnActionEvent) {
        ViewCommentPopup.show(project, root, pointOf(event), comments)
    }

    private fun pointOf(event: AnActionEvent): RelativePoint =
        (event.inputEvent as? MouseEvent)?.let { RelativePoint(it) }
            ?: JBPopupFactory.getInstance().guessBestPopupLocation(event.dataContext)
}
