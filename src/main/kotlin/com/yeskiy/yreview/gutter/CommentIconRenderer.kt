package com.yeskiy.yreview.gutter

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.ui.CommentCard
import icons.CollaborationToolsIcons
import javax.swing.Icon

/** The speech bubble of the platform code review. One icon stands for one comment range. */
class CommentIconRenderer(
    private val project: Project,
    private val root: VirtualFile,
    private val comments: List<StoredComment>,
) : GutterIconRenderer() {

    override fun getIcon(): Icon = CollaborationToolsIcons.Comment

    override fun getAlignment(): Alignment = Alignment.LEFT

    override fun getTooltipText(): String = CommentCard.html(comments)

    override fun getAccessibleName(): String = "Review comment"

    override fun getAccessibleTooltipText(): String = CommentCard.plain(comments)

    override fun getClickAction(): AnAction = DumbAwareAction.create { open(it) }

    override fun equals(other: Any?): Boolean =
        other is CommentIconRenderer && other.root == root && other.comments == comments

    override fun hashCode(): Int = 31 * root.hashCode() + comments.hashCode()

    /** The gutter of the editor puts the editor itself in the context of the click. */
    private fun open(event: AnActionEvent) {
        val editor = event.getData(CommonDataKeys.EDITOR) ?: return
        CommentGutter.getInstance(project).toggleCard(editor, root, comments)
    }
}
