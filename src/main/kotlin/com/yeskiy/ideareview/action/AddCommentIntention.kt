package com.yeskiy.ideareview.action

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.yeskiy.ideareview.store.NoteRefs
import com.yeskiy.ideareview.store.ReviewService
import com.yeskiy.ideareview.ui.AddCommentDialog

class AddCommentIntention : IntentionAction {

    override fun getText(): String = "Add review comment"

    override fun getFamilyName(): String = "Review comments"

    override fun startInWriteAction(): Boolean = false

    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean {
        if (editor == null || file == null) return false
        val virtualFile = file.virtualFile ?: return false
        return ReviewService.getInstance(project).relativePath(virtualFile) != null
    }

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        if (editor == null || file == null) return
        val virtualFile = file.virtualFile ?: return
        val service = ReviewService.getInstance(project)
        val path = service.relativePath(virtualFile) ?: return
        val commit = service.headOf(virtualFile) ?: return
        val book = service.bookFor(virtualFile) ?: return
        val target = CommentTarget.fromEditor(editor, path)

        val dialog = AddCommentDialog(project, "${target.path}:${target.startLine}-${target.endLine}")
        if (!dialog.showAndGet()) return
        book.add(NoteRefs.LOCAL, commit, target.path, target.startLine, target.endLine, dialog.text)
    }
}
