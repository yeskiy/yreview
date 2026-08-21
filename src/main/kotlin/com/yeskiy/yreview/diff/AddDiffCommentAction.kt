package com.yeskiy.yreview.diff

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.action.CommentTarget
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.ui.AddCommentDialog
import com.yeskiy.yreview.ui.ShareFailure

val REVIEW_ANCHOR: Key<DiffAnchor> = Key.create("com.yeskiy.yreview.anchor")
val REVIEW_ROOT: Key<VirtualFile> = Key.create("com.yeskiy.yreview.root")

class AddDiffCommentAction : AnAction() {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        val editor = event.getData(CommonDataKeys.EDITOR)
        val anchor = editor?.getUserData(REVIEW_ANCHOR)
        event.presentation.isVisible = editor != null
        event.presentation.isEnabled = anchor != null
        event.presentation.description =
            if (anchor != null) "Write a review comment on the selected lines."
            else "This diff has no revision behind it, so a comment has nowhere to anchor."
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor: Editor = event.getData(CommonDataKeys.EDITOR) ?: return
        val anchor = editor.getUserData(REVIEW_ANCHOR) ?: return
        val root = editor.getUserData(REVIEW_ROOT) ?: return

        val target = CommentTarget.fromEditor(editor, anchor.path)
        val working = if (anchor.dirty) " (working tree)" else ""
        val header = "${anchor.path}:${target.startLine}-${target.endLine} @${anchor.commit.take(7)}$working"

        val dialog = AddCommentDialog(project, header, ReviewSettings.getInstance(project).sharing.shareByDefault)
        if (!dialog.showAndGet()) return

        try {
            val result = ReviewService.getInstance(project).addComment(
                root,
                NoteRefs.refFor(dialog.share),
                anchor.commit,
                anchor.path,
                target.startLine,
                target.endLine,
                dialog.text,
            )
            result.shareError?.let { ShareFailure.report(project, TITLE, it) }
        } catch (failure: NotesWriteException) {
            Messages.showErrorDialog(project, failure.message ?: "The comment was not written.", TITLE)
        }
    }

    private companion object {
        const val TITLE = "Add Review Comment"
    }
}
