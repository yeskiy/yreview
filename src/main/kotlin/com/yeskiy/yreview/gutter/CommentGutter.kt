package com.yeskiy.yreview.gutter

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryChangeListener
import java.util.concurrent.ConcurrentHashMap

/**
 * Draws one comment icon per range in the markup model of an open editor. The plugin reads the
 * git notes once per editor, and again after every write, in place of once per daemon pass.
 */
@Service(Service.Level.PROJECT)
class CommentGutter(private val project: Project) : Disposable {

    private val painted = ConcurrentHashMap<Editor, List<RangeHighlighter>>()

    init {
        val bus = project.messageBus.connect(this)
        bus.subscribe(REVIEW_COMMENTS, ReviewCommentListener { repaintAll() })
        bus.subscribe(GitRepository.GIT_REPO_CHANGE, GitRepositoryChangeListener { repaintAll() })
    }

    fun attach(editor: Editor) {
        painted[editor] = emptyList()
        repaint(editor)
    }

    fun detach(editor: Editor) {
        painted.remove(editor)
    }

    override fun dispose() = Unit

    private fun repaintAll() = painted.keys.forEach { repaint(it) }

    /** Reads the notes off the user interface thread, then draws the icons on it. */
    private fun repaint(editor: Editor) {
        val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            val service = ReviewService.getInstance(project)
            val root = service.repositoryRoot(file)
            val path = service.relativePath(file)
            val commit = service.headOf(file)
            val byLine =
                if (root == null || path == null || commit == null) emptyMap()
                else CommentIndex.byStartLine(service.bookForRoot(root).open(commit), path)
            ApplicationManager.getApplication().invokeLater({ draw(editor, root, byLine) }, project.disposed)
        }
    }

    private fun draw(editor: Editor, root: VirtualFile?, byLine: Map<Int, List<StoredComment>>) {
        val old = painted[editor] ?: return
        if (editor.isDisposed) return
        old.forEach { editor.markupModel.removeHighlighter(it) }
        painted[editor] =
            if (root == null) emptyList()
            else byLine.entries.mapNotNull { (line, here) -> mark(editor, root, line, here) }
    }

    private fun mark(
        editor: Editor,
        root: VirtualFile,
        line: Int,
        here: List<StoredComment>,
    ): RangeHighlighter? {
        if (line < 1 || line > editor.document.lineCount) return null
        return editor.markupModel.addLineHighlighter(null, line - 1, HighlighterLayer.LAST).also {
            it.gutterIconRenderer = CommentIconRenderer(project, root, here)
        }
    }

    companion object {
        fun getInstance(project: Project): CommentGutter = project.service()
    }
}
