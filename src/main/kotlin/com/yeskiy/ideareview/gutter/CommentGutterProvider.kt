package com.yeskiy.ideareview.gutter

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.IconLoader
import com.intellij.psi.PsiElement
import com.yeskiy.ideareview.store.ReviewService

/**
 * One marker per file for now, which proves the icon and the read path. A marker per line
 * range needs a range index and arrives with the next plan.
 */
class CommentGutterProvider : LineMarkerProvider {

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        val file = element.containingFile ?: return null
        if (element != file.firstChild) return null

        val virtualFile = file.virtualFile ?: return null
        val project = file.project
        val service = ReviewService.getInstance(project)
        val path = service.relativePath(virtualFile) ?: return null
        val commit = service.headOf(virtualFile) ?: return null
        val book = service.bookFor(virtualFile) ?: return null

        val here = book.open(commit).filter { it.comment.location?.path == path }
        if (here.isEmpty()) return null

        val body = here.joinToString("\n\n") { stored ->
            val range = stored.comment.location?.range
            "${range?.startLine}-${range?.endLine}: ${stored.comment.description}"
        }

        return LineMarkerInfo(
            element,
            element.textRange,
            ICON,
            { "${here.size} review comment(s)" },
            { _, _ -> Messages.showInfoMessage(project, body, "Review Comments") },
            GutterIconRenderer.Alignment.LEFT,
            { "Review comments" },
        )
    }

    private companion object {
        val ICON = IconLoader.getIcon("/icons/comment.svg", CommentGutterProvider::class.java)
    }
}
