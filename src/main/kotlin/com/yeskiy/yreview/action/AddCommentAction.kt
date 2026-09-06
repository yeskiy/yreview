package com.yeskiy.yreview.action

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorKind
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.gutter.CommentGutter
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.ui.AddCommentPopup
import com.yeskiy.yreview.ui.CommentText
import com.yeskiy.yreview.ui.ReviewNotice

data class Target(val path: String, val range: Range) {

    val startLine: Int get() = range.startLine

    val endLine: Int get() = range.endLine

    /** The line the box of the editor sits under. */
    val lastLine: Int get() = maxOf(range.startLine, range.endLine)
}

object CommentTarget {
    /** Editor lines are zero based. Every stored line number is one based. */
    fun fromEditor(editor: Editor, path: String): Target {
        val selection = editor.selectionModel
        val document = editor.document
        val startOffset = if (selection.hasSelection()) selection.selectionStart else editor.caretModel.offset
        val endOffset = if (selection.hasSelection()) selection.selectionEnd else editor.caretModel.offset
        val startLine = document.getLineNumber(startOffset)
        val endLine = document.getLineNumber(endOffset)
        val endLineStart = document.getLineStartOffset(endLine)
        return Target(
            path = path,
            range = CommentRange.of(
                startLine = startLine + 1,
                startColumn = startOffset - document.getLineStartOffset(startLine),
                endLine = endLine + 1,
                endColumn = endOffset - endLineStart,
                endLineLength = document.getLineEndOffset(endLine) - endLineStart,
            ),
        )
    }
}

class AddCommentAction : AnAction(), DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    /**
     * A diff editor holds the same file and the same project as an ordinary editor. This action
     * stops there, because the diff action anchors the comment at the revision of the diff.
     *
     * [EditorPick] answers for the preview side of a split editor too, and the editor it gives
     * there is the text side of the same tab. That editor is a main editor, so the guard on the
     * diff editor still holds.
     */
    override fun update(event: AnActionEvent) {
        val project = event.project
        val editor = EditorPick.of(event)
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE)
        event.presentation.isEnabledAndVisible =
            project != null && editor != null && file != null &&
                editor.editorKind != EditorKind.DIFF &&
                ReviewService.getInstance(project).anchorOf(file) !is AnchorResult.NoPlace
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor = EditorPick.of(event) ?: return
        val file: VirtualFile = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        val found = ReviewService.getInstance(project).anchorOf(file)
        if (found is AnchorResult.NoCommit) {
            Messages.showErrorDialog(project, "This repository has no commit yet.", CommentWriter.TITLE)
            return
        }
        val anchor = (found as? AnchorResult.Found)?.anchor ?: return
        val target = CommentTarget.fromEditor(editor, anchor.path)

        val header = CommentText.header(target.path, target.range)
        val canPush = anchor.kind == StoreKind.GIT
        if (CommentPlace.of(event) == BoxPlace.PREVIEW) {
            AddCommentPopup.show(project, editor, header, canPush, event.dataContext) { text, share ->
                if (CommentWriter.write(project, anchor, target, text, share)) {
                    ReviewNotice.say(project, "The comment went to $header.")
                }
            }
            return
        }
        CommentGutter.getInstance(project).openWriteBox(editor, target.lastLine, header, canPush) { text, share ->
            CommentWriter.write(project, anchor, target, text, share)
        }
    }
}
