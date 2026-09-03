package com.yeskiy.yreview.action

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.yeskiy.yreview.gutter.CommentGutter
import com.yeskiy.yreview.settings.ProductName
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.ui.CommentText

class AddCommentIntention : IntentionAction {

    override fun getText(): String = "Add review comment"

    override fun getFamilyName(): String = ProductName.TEXT

    override fun startInWriteAction(): Boolean = false

    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean {
        if (editor == null || file == null) return false
        val virtualFile = file.virtualFile ?: return false
        return ReviewService.getInstance(project).anchorOf(virtualFile) is AnchorResult.Found
    }

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        if (editor == null || file == null) return
        val virtualFile = file.virtualFile ?: return
        val found = ReviewService.getInstance(project).anchorOf(virtualFile)
        val anchor = (found as? AnchorResult.Found)?.anchor ?: return
        val target = CommentTarget.fromEditor(editor, anchor.path)

        CommentGutter.getInstance(project).openWriteBox(
            editor,
            target.lastLine,
            CommentText.header(target.path, target.startLine, target.endLine),
            anchor.kind == StoreKind.GIT,
        ) { text, share -> CommentWriter.write(project, anchor, target, text, share) }
    }
}
