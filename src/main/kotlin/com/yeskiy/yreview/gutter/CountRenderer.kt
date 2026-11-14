package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.colors.EditorColors
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.openapi.editor.markup.TextAttributes
import java.awt.Font
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.Rectangle2D

/** The count of open comments over a piece of text, in small muted digits after the line end. */
class CountRenderer(val text: String) : EditorCustomElementRenderer {

    override fun calcWidthInPixels(inlay: Inlay<*>): Int =
        inlay.editor.contentComponent.getFontMetrics(fontOf(inlay)).stringWidth(text) + GAP * 2

    override fun paint(inlay: Inlay<*>, g: Graphics2D, targetRegion: Rectangle2D, textAttributes: TextAttributes) {
        val scheme = inlay.editor.colorsScheme
        g.color = scheme.getAttributes(DefaultLanguageHighlighterColors.INLAY_TEXT_WITHOUT_BACKGROUND)?.foregroundColor
            ?: scheme.getColor(EditorColors.LINE_NUMBERS_COLOR)
            ?: return
        g.font = fontOf(inlay)
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
        g.drawString(text, (targetRegion.x + GAP).toFloat(), (targetRegion.y + inlay.editor.ascent).toFloat())
    }

    private fun fontOf(inlay: Inlay<*>): Font =
        inlay.editor.colorsScheme.getFont(EditorFontType.PLAIN).let { it.deriveFont(it.size2D * SCALE) }

    private companion object {
        const val GAP = 4

        const val SCALE = 0.85f
    }
}
