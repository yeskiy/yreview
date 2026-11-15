package com.yeskiy.yreview.markdown

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.yeskiy.yreview.action.PreviewLines
import com.yeskiy.yreview.action.PreviewSelection
import com.yeskiy.yreview.action.PreviewSelections
import org.intellij.plugins.markdown.extensions.MarkdownBrowserPreviewExtension
import org.intellij.plugins.markdown.ui.preview.BrowserPipe
import org.intellij.plugins.markdown.ui.preview.MarkdownHtmlPanel
import org.intellij.plugins.markdown.ui.preview.ResourceProvider
import javax.swing.SwingUtilities

/** Adds the selection script to one JetBrains Markdown preview, and keeps what it sends. */
class PreviewSelectionExtension(private val panel: MarkdownHtmlPanel) :
    MarkdownBrowserPreviewExtension, ResourceProvider {

    private val handler = object : BrowserPipe.Handler {
        override fun processMessageReceived(data: String): Boolean {
            val stamp = panel.virtualFile
                ?.let { FileDocumentManager.getInstance().getCachedDocument(it)?.modificationStamp }
            if (stamp != null) PreviewSelections.put(panel, PreviewSelection.parse(data), stamp)
            return false
        }
    }

    init {
        panel.browserPipe?.subscribe(TAG, handler)
    }

    override val priority get() = MarkdownBrowserPreviewExtension.Priority.DEFAULT
    override val scripts get() = listOf(SCRIPT)
    override val styles get() = emptyList<String>()
    override val resourceProvider get() = this

    override fun canProvide(resourceName: String) = resourceName == SCRIPT

    override fun loadResource(resourceName: String) =
        ResourceProvider.loadInternalResource(PreviewSelectionExtension::class.java, "/$SCRIPT", "text/javascript")

    override fun dispose() {
        panel.browserPipe?.removeSubscription(TAG, handler)
        PreviewSelections.remove(panel)
    }

    class Provider : MarkdownBrowserPreviewExtension.Provider {
        override fun createBrowserExtension(panel: MarkdownHtmlPanel) = PreviewSelectionExtension(panel)
    }

    companion object {
        const val TAG = "yreview/selection"
        const val SCRIPT = "yreview/previewSelection.js"
    }
}

/** The lines of the preview selection while the preview side of the split editor has the focus. */
class MarkdownPreviewLines : PreviewLines {

    override fun linesOf(event: AnActionEvent, document: Document): IntRange? {
        val split = event.getData(PlatformCoreDataKeys.FILE_EDITOR) as? TextEditorWithPreview ?: return null
        val focus = event.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT) ?: return null
        val preview = split.previewEditor.component
        if (!SwingUtilities.isDescendingFrom(focus, preview)) return null
        val picked = PreviewSelections.keys()
            .filterIsInstance<MarkdownHtmlPanel>()
            .filter { SwingUtilities.isDescendingFrom(it.component, preview) }
            .firstNotNullOfOrNull { PreviewSelections.of(it, document.modificationStamp) }
            ?: return null
        val lineOf = { offset: Int -> document.getLineNumber(offset.coerceIn(0, document.textLength)) }
        return PreviewSelection.lines(picked.start, picked.end, lineOf)
    }
}
