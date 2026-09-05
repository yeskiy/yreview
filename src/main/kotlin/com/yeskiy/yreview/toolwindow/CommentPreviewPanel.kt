package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.editor.ComponentInlayAlignment
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.InlayProperties
import com.intellij.openapi.editor.addComponentInlay
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.usages.UsageViewPresentation
import com.intellij.usages.impl.UsagePreviewPanel
import com.yeskiy.yreview.diagnostic.Redact
import com.yeskiy.yreview.gutter.CommentIndex
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.tasks.CommentPick
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.ui.ReadBox

/** The comment that the preview pane shows, and the repository root that holds it. */
data class PreviewComment(val root: VirtualFile, val stored: StoredComment)

/**
 * The preview pane of the tool window, with the full review comment under the previewed lines.
 *
 * The pane builds an editor of its own and releases it again. The card is a block inlay of that
 * editor, so the card goes with the editor. [onEditorCreated] therefore draws the card again for
 * every new editor, and [showComment] draws it when the pane keeps the editor it already has.
 *
 * The card of this pane takes no handler, so the card carries no button. The pane reads a
 * comment back, and the card of the file editor keeps the controls.
 *
 * The pane also follows every write to the store. It reads the record of its card again
 * after a write, then it removes the card when the store no longer holds that record. A
 * delete removes the record, and a resolve closes it.
 *
 * [resolvedShown] is the resolved switch of the tab that holds this pane. While the switch
 * stands on, a resolved record keeps its card, because the tree keeps its row.
 */
class CommentPreviewPanel(
    private val project: Project,
    private val resolvedShown: () -> Boolean,
) : UsagePreviewPanel(project, UsageViewPresentation()) {

    private var live: Editor? = null

    private var card: Inlay<*>? = null

    private var wanted: PreviewComment? = null

    init {
        project.messageBus.connect(this).subscribe(REVIEW_COMMENTS, ReviewCommentListener { recheck() })
    }

    /** Names the comment the pane shows. A null value clears the card. */
    fun showComment(comment: PreviewComment?) {
        wanted = comment
        later()
    }

    override fun onEditorCreated(editor: Editor) {
        live = editor
        later()
    }

    override fun dispose() {
        card = null
        live = null
        wanted = null
        super.dispose()
    }

    /**
     * Reads the record of the card again after a write to the store.
     *
     * The read runs git, so it runs on a pooled thread. A pane that holds no card reads
     * nothing, so a write beside an empty pane costs one comparison.
     */
    private fun recheck() {
        val asked = wanted ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            if (project.isDisposed || isDisposed) return@executeOnPooledThread
            liveRecords(asked)?.let { live ->
                ApplicationManager.getApplication().invokeLater({ settle(asked, live) }, project.disposed)
            }
        }
    }

    /** The records the card may still match, or null when the read of the store failed. */
    private fun liveRecords(comment: PreviewComment): List<StoredComment>? = try {
        val book = ReviewService.getInstance(project).bookForRoot(comment.root)
        val shown = resolvedShown()
        CommentPick.of(
            book.open(comment.stored.commit),
            if (shown) book.closed(comment.stored.commit) else emptyList(),
            shown,
        ).map { it.stored }
    } catch (failure: Exception) {
        logger.warn(
            "the review preview pane could not read the comments again",
            Redact.failure(failure, Redact.homes(), project.basePath),
        )
        null
    }

    /** Draws the answer of [CardChoice]. An answer that belongs to an older card changes nothing. */
    private fun settle(asked: PreviewComment, live: List<StoredComment>) {
        if (isDisposed || wanted != asked) return
        val move = CardChoice.after(asked.stored, live)
        if (move.redraw) showComment(move.comment?.let { PreviewComment(asked.root, it) })
    }

    /** The pane finishes its own layout first, so the card waits for the next round of events. */
    private fun later() =
        ApplicationManager.getApplication().invokeLater({ draw() }, project.disposed)

    private fun draw() {
        card?.takeIf { it.isValid }?.let { Disposer.dispose(it) }
        card = null
        val comment = wanted ?: return
        val editor = live?.takeIf { !it.isDisposed } ?: return
        if (editor !is EditorEx) return
        startAtFirstColumn(editor)
        if (FileDocumentManager.getInstance().getFile(editor.document)?.path != pathOf(comment)) return
        val line = CommentIndex.lastLine(listOf(comment.stored))
        if (line < 1 || line > editor.document.lineCount) return
        card = editor.addComponentInlay(
            editor.document.getLineEndOffset(line - 1),
            InlayProperties().showAbove(false).relatesToPrecedingText(true),
            ReadBox.preview(project, listOf(comment.stored)),
            ComponentInlayAlignment.FIT_VIEWPORT_WIDTH,
        )
    }

    /**
     * Puts the view of the preview editor back on the first column.
     *
     * The pane scrolls the editor to the lines of the row, and that move also carries the view
     * to the right. The reader then starts in the middle of a line. The reset waits for the
     * move of the pane, because a scroll that runs now would win over an earlier reset.
     */
    private fun startAtFirstColumn(editor: Editor) =
        editor.scrollingModel.runActionOnScrollingFinished {
            if (!editor.isDisposed) editor.scrollingModel.scrollHorizontally(0)
        }

    /** The pane keeps its editor between two rows of the same file, so the card checks the file. */
    private fun pathOf(comment: PreviewComment): String? =
        comment.stored.comment.location?.let { "${comment.root.path}/${it.path}" }

    companion object {

        private val logger = logger<CommentPreviewPanel>()

        /** The record behind a comment row. The lookup runs git, so the caller stays off the user interface thread. */
        fun commentOf(project: Project, task: ReviewTask): PreviewComment? {
            if (task.kind != TaskKind.COMMENT || task.rootPath.isEmpty()) return null
            val root = LocalFileSystem.getInstance().findFileByPath(task.rootPath) ?: return null
            val stored = ReviewService.getInstance(project).bookForRoot(root)
                .list(task.revision)
                .firstOrNull { it.id == task.id }
                ?: return null
            return PreviewComment(root, stored)
        }
    }
}
