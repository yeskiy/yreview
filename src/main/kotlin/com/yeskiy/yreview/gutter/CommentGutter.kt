package com.yeskiy.yreview.gutter

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.util.EditorUtil
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.ui.CommentDelete
import com.yeskiy.yreview.ui.CommentResolve
import com.yeskiy.yreview.ui.ReadBox
import com.yeskiy.yreview.ui.ReviewColors
import com.yeskiy.yreview.ui.WriteBox
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryChangeListener
import java.util.concurrent.ConcurrentHashMap

/** The icons and the line spans that one file needs. The plugin builds this off the user interface thread. */
data class CommentMarks(val byLine: Map<Int, List<StoredComment>>, val spans: List<IntRange>) {

    companion object {
        val EMPTY = CommentMarks(emptyMap(), emptyList())
    }
}

/**
 * Draws one comment icon per range in the markup model of an open editor, and a quiet background
 * over the lines that the range covers. The plugin reads the git notes once per editor, and again
 * after every write, in place of once per daemon pass.
 *
 * The same class holds the boxes that the editor shows under the lines. A click on the icon opens
 * the card of that range, and the Add Review Comment action opens the box that writes a comment.
 */
@Service(Service.Level.PROJECT)
class CommentGutter(private val project: Project) : Disposable {

    private val painted = ConcurrentHashMap<Editor, List<RangeHighlighter>>()

    private val boxes = ConcurrentHashMap<Editor, EditorInlays>()

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
        boxes.remove(editor)?.closeAll()
    }

    /**
     * Shows the card of these comments under their last line, or closes the card that the same
     * icon already opened. One icon therefore never carries two cards.
     *
     * The Delete key acts on a card that holds one comment. The key does nothing on a card of
     * several comments, because the key cannot name the comment that the user means.
     */
    fun toggleCard(editor: Editor, root: VirtualFile, comments: List<StoredComment>) {
        val key = InlayKey(InlayKind.CARD, comments.firstOrNull()?.id.orEmpty())
        val inlays = inlaysOf(editor)
        if (inlays.holds(key)) {
            inlays.close(key)
            return
        }
        val close = { inlays.close(key) }
        val resolve = { stored: StoredComment ->
            close()
            CommentResolve.run(project, root, stored)
        }
        val delete = { stored: StoredComment -> CommentDelete.run(project, stored, close) }
        val card = ReadBox.build(project, comments, resolve, delete, close)
        val inlay = inlays.show(key, CommentIndex.lastLine(comments), card)
        val alone = comments.singleOrNull()
        if (inlay != null && alone != null) ReadBox.bindDelete(card, inlay) { delete(alone) }
    }

    /** Opens the box that writes a new comment under [line]. A second call replaces the open box. */
    fun openWriteBox(editor: Editor, line: Int, header: String, save: (String, Boolean) -> Unit) {
        val key = InlayKey(InlayKind.WRITE, line.toString())
        val inlays = inlaysOf(editor)
        inlays.close(key)
        val box = WriteBox(project, header, { inlays.close(key) }) { text, share ->
            inlays.close(key)
            save(text, share)
        }
        inlays.show(key, line, box.panel)?.let { box.bind(it) }
    }

    override fun dispose() {
        boxes.values.forEach { it.closeAll() }
        boxes.clear()
    }

    /**
     * The boxes of one editor. The map drops the editor with the editor itself, so an editor
     * that the gutter never painted also leaves no entry behind.
     */
    private fun inlaysOf(editor: Editor): EditorInlays {
        val known = boxes[editor]
        if (known != null) return known
        val made = EditorInlays(editor)
        if (editor.isDisposed) return made
        boxes[editor] = made
        EditorUtil.disposeWithEditor(editor) { boxes.remove(editor) }
        return made
    }

    private fun repaintAll() = painted.keys.forEach { repaint(it) }

    /** Reads the notes off the user interface thread, then draws the marks on it. */
    private fun repaint(editor: Editor) {
        val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            val service = ReviewService.getInstance(project)
            val root = service.repositoryRoot(file)
            val marks = marksOf(service, file, root)
            ApplicationManager.getApplication().invokeLater({ draw(editor, root, marks) }, project.disposed)
        }
    }

    private fun marksOf(service: ReviewService, file: VirtualFile, root: VirtualFile?): CommentMarks {
        val path = service.relativePath(file)
        val commit = service.headOf(file)
        if (root == null || path == null || commit == null) return CommentMarks.EMPTY
        val open = service.bookForRoot(root).open(commit)
        return CommentMarks(CommentIndex.byStartLine(open, path), CommentIndex.lineSpans(open, path))
    }

    /**
     * A new set of comments makes every open card stale, so the cards close. The box that
     * writes a comment stays open, because the user may still hold text in it.
     */
    private fun draw(editor: Editor, root: VirtualFile?, marks: CommentMarks) {
        val old = painted[editor] ?: return
        if (editor.isDisposed) return
        boxes[editor]?.closeKind(InlayKind.CARD)
        old.forEach { editor.markupModel.removeHighlighter(it) }
        painted[editor] =
            if (root == null) emptyList()
            else marks.spans.mapNotNull { paint(editor, it) } +
                marks.byLine.entries.mapNotNull { (line, here) -> mark(editor, root, line, here) }
    }

    /**
     * Paints the lines of one span. The color comes from the scheme of the editor through a
     * [com.intellij.openapi.editor.colors.TextAttributesKey], so a new theme repaints the span.
     * The layer stays under the caret row, so the row of the caret still reads.
     */
    private fun paint(editor: Editor, span: IntRange): RangeHighlighter? {
        val lines = editor.document.lineCount
        if (span.first < 1 || span.first > lines) return null
        val last = minOf(span.last, lines)
        return editor.markupModel.addRangeHighlighter(
            ReviewColors.COMMENT_RANGE,
            editor.document.getLineStartOffset(span.first - 1),
            editor.document.getLineEndOffset(last - 1),
            HighlighterLayer.CARET_ROW - 1,
            HighlighterTargetArea.LINES_IN_RANGE,
        )
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
