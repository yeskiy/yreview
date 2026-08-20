package com.yeskiy.ideareview.diff

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.ideareview.action.CommentTarget
import com.yeskiy.ideareview.store.NoteRefs
import com.yeskiy.ideareview.store.NotesWriteException
import com.yeskiy.ideareview.store.ReviewService
import com.yeskiy.ideareview.ui.AddCommentDialog

val REVIEW_ANCHOR: Key<DiffAnchor> = Key.create("com.yeskiy.ideareview.anchor")
val REVIEW_ROOT: Key<VirtualFile> = Key.create("com.yeskiy.ideareview.root")

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

        val dialog = AddCommentDialog(project, header)
        if (!dialog.showAndGet()) return

        val book = ReviewService.getInstance(project).bookForRoot(root)
        try {
            book.add(NoteRefs.LOCAL, anchor.commit, anchor.path, target.startLine, target.endLine, dialog.text)
        } catch (failure: NotesWriteException) {
            Messages.showErrorDialog(project, failure.message ?: "The comment was not written.", "Add Review Comment")
        }
    }
}
