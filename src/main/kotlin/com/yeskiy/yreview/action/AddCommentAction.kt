package com.yeskiy.yreview.action

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.ui.AddCommentDialog
import com.yeskiy.yreview.ui.ShareFailure

data class Target(val path: String, val startLine: Int, val endLine: Int)

object CommentTarget {
    /** Editor lines are zero based. Every stored line number is one based. */
    fun fromEditor(editor: Editor, path: String): Target {
        val selection = editor.selectionModel
        val document = editor.document
        val startOffset = if (selection.hasSelection()) selection.selectionStart else editor.caretModel.offset
        val endOffset = if (selection.hasSelection()) selection.selectionEnd else editor.caretModel.offset
        return Target(
            path = path,
            startLine = document.getLineNumber(startOffset) + 1,
            endLine = document.getLineNumber(endOffset) + 1,
        )
    }
}

class AddCommentAction : AnAction() {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        val project = event.project
        val editor = event.getData(CommonDataKeys.EDITOR)
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE)
        event.presentation.isEnabledAndVisible =
            project != null && editor != null && file != null &&
                ReviewService.getInstance(project).relativePath(file) != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor = event.getData(CommonDataKeys.EDITOR) ?: return
        val file: VirtualFile = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val service = ReviewService.getInstance(project)

        val path = service.relativePath(file) ?: return
        val commit = service.headOf(file) ?: run {
            Messages.showErrorDialog(project, "This repository has no commit yet.", TITLE)
            return
        }
        val root = service.repositoryRoot(file) ?: return
        val target = CommentTarget.fromEditor(editor, path)

        val dialog = AddCommentDialog(
            project,
            "${target.path}:${target.startLine}-${target.endLine}",
            ReviewSettings.getInstance(project).sharing.shareByDefault,
        )
        if (!dialog.showAndGet()) return

        try {
            val result = service.addComment(
                root,
                NoteRefs.refFor(dialog.share),
                commit,
                target.path,
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
