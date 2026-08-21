package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.ComponentInlayAlignment
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.InlayProperties
import com.intellij.openapi.editor.addComponentInlay
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.util.Disposer
import javax.swing.JComponent

/** What a box of the editor holds. One box reads comments back, and the other one writes one. */
enum class InlayKind { CARD, WRITE }

/**
 * The name of one box. Two clicks on the same icon therefore never stack two boxes.
 *
 * A card takes the identifier of its first comment, and a write box takes its line. Two icons
 * that end on the same line keep two names, so each icon drives its own card.
 */
data class InlayKey(val kind: InlayKind, val name: String)

/**
 * The boxes that one editor holds open.
 *
 * A box is a block inlay that carries a Swing panel. The platform puts the panel in the
 * content component of the editor and disposes the panel with the editor, so a closed file
 * leaves nothing behind. Every method here runs on the user interface thread.
 */
class EditorInlays(private val editor: Editor) {

    private val open = HashMap<InlayKey, Inlay<*>>()

    fun holds(key: InlayKey): Boolean = open[key]?.isValid == true

    fun close(key: InlayKey) {
        open.remove(key)?.takeIf { it.isValid }?.let { Disposer.dispose(it) }
    }

    fun closeKind(kind: InlayKind) = open.keys.filter { it.kind == kind }.forEach { close(it) }

    fun closeAll() = open.keys.toList().forEach { close(it) }

    /**
     * Puts [component] under [line] and returns the inlay that carries it.
     *
     * The answer is null when the line sits outside the document, or when the editor takes no
     * component. A component inlay needs an [EditorEx], and every editor of a file is one.
     */
    fun show(key: InlayKey, line: Int, component: JComponent): Inlay<*>? {
        if (editor.isDisposed || editor !is EditorEx) return null
        if (line < 1 || line > editor.document.lineCount) return null
        val inlay = editor.addComponentInlay(
            editor.document.getLineEndOffset(line - 1),
            InlayProperties().showAbove(false).relatesToPrecedingText(true),
            component,
            ComponentInlayAlignment.FIT_VIEWPORT_WIDTH,
        ) ?: return null
        open[key] = inlay
        Disposer.register(inlay) { if (open[key] === inlay) open.remove(key) }
        return inlay
    }
}
