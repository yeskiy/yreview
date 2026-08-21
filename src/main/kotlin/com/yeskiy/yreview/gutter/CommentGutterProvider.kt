package com.yeskiy.yreview.gutter

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiElement
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment

/**
 * Draws one icon per comment range. The daemon calls [collectSlowLineMarkers] on a background
 * thread with every element of the pass, which is where the git read belongs. The fast path
 * stays empty for that reason.
 */
class CommentGutterProvider : LineMarkerProvider {

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? = null

    override fun collectSlowLineMarkers(
        elements: MutableList<out PsiElement>,
        result: MutableCollection<in LineMarkerInfo<*>>,
    ) {
        val file = elements.firstOrNull()?.containingFile ?: return
        val virtualFile = file.virtualFile ?: return
        val project = file.project
        val service = ReviewService.getInstance(project)
        val path = service.relativePath(virtualFile) ?: return
        val commit = service.headOf(virtualFile) ?: return
        val root = service.repositoryRoot(virtualFile) ?: return
        val document = PsiDocumentManager.getInstance(project).getDocument(file) ?: return

        val byLine = CommentIndex.byStartLine(service.bookForRoot(root).open(commit), path)
        if (byLine.isEmpty()) return

        // One line holds one icon. The first leaf that starts on a line carries it.
        val taken = mutableSetOf<Int>()
        elements.asSequence()
            .filter { it.firstChild == null }
            .sortedBy { it.textRange.startOffset }
            .forEach { element ->
                val offset = element.textRange.startOffset
                if (offset > document.textLength) return@forEach
                val line = document.getLineNumber(offset) + 1
                if (!taken.add(line)) return@forEach
                byLine[line]?.let { result.add(marker(project, root, element, it)) }
            }
    }

    private fun marker(
        project: Project,
        root: VirtualFile,
        element: PsiElement,
        here: List<StoredComment>,
    ): LineMarkerInfo<PsiElement> {
        val tooltip = here.joinToString("\n\n") { CommentPopup.summary(it) }
        return LineMarkerInfo(
            element,
            element.textRange,
            ICON,
            { tooltip },
            { event, _ -> CommentPopup.show(project, root, event, here) },
            GutterIconRenderer.Alignment.LEFT,
            { "Review comment" },
        )
    }

    private companion object {
        val ICON = IconLoader.getIcon("/icons/comment.svg", CommentGutterProvider::class.java)
    }
}
