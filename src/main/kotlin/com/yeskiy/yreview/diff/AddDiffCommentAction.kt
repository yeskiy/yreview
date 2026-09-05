package com.yeskiy.yreview.diff

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.action.CommentTarget
import com.yeskiy.yreview.action.CommentWriter
import com.yeskiy.yreview.store.ReviewAnchor
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.ui.AddCommentPopup
import com.yeskiy.yreview.ui.CommentText

val REVIEW_ANCHOR: Key<DiffAnchor> = Key.create("com.yeskiy.yreview.anchor")
val REVIEW_ROOT: Key<VirtualFile> = Key.create("com.yeskiy.yreview.root")

class AddDiffCommentAction : AnAction(), DumbAware {

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
        val header = CommentText.diffHeader(
            anchor.path,
            target.startLine,
            target.endLine,
            anchor.commit,
            anchor.dirty,
        )

        AddCommentPopup.show(project, editor, header) { text, share ->
            CommentWriter.write(
                project,
                ReviewAnchor(StoreKind.GIT, root, anchor.commit, anchor.path),
                target,
                text,
                share,
            )
        }
    }
}
