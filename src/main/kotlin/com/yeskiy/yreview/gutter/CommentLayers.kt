package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.RangeText
import com.yeskiy.yreview.ui.ReviewColors

/** The document offsets that one comment covers. [wholeLines] paints the full width of each line. */
data class CommentPlace(val start: Int, val end: Int, val wholeLines: Boolean)

/**
 * Paints the open comments of one file. A comment with columns paints only its characters,
 * so a soft wrapped line lights up only there. A comment without columns paints whole lines.
 */
object CommentLayers {

    /** The background stays under the caret row, so the row of the caret still reads. */
    private const val LAYER = HighlighterLayer.CARET_ROW - 1

    fun paint(editor: Editor, ranges: List<Range>): List<RangeHighlighter> =
        ranges.mapNotNull { placeOf(editor.document, it) }.map { place ->
            editor.markupModel.addRangeHighlighter(
                ReviewColors.COMMENT_RANGE,
                place.start,
                place.end,
                LAYER,
                if (place.wholeLines) HighlighterTargetArea.LINES_IN_RANGE else HighlighterTargetArea.EXACT_RANGE,
            )
        }

    /**
     * The offsets of one range, or null when the range starts outside the document.
     *
     * A column turns into an offset the same way the Add Review Comment action reads it:
     * the start of the line plus the column. A column past the line end stops at the line end,
     * and a line past the document end stops at the document end. Columns that leave no
     * character after that clamp fall back to the whole lines, so the comment still shows.
     */
    fun placeOf(document: Document, range: Range): CommentPlace? {
        val lines = document.lineCount
        val first = minOf(range.startLine, range.endLine)
        if (first < 1 || first > lines) return null
        val last = minOf(maxOf(range.startLine, range.endLine), lines)
        val whole = CommentPlace(document.getLineStartOffset(first - 1), document.getLineEndOffset(last - 1), true)
        if (!RangeText.hasColumns(range.startColumn, range.endColumn)) return whole
        val from = offsetOf(document, range.startLine, range.startColumn)
        val to = offsetOf(document, range.endLine, range.endColumn)
        return if (from == to) whole else CommentPlace(minOf(from, to), maxOf(from, to), false)
    }

    private fun offsetOf(document: Document, line: Int, column: Int): Int {
        if (line > document.lineCount) return document.textLength
        val start = document.getLineStartOffset(line - 1)
        return start + column.coerceIn(0, document.getLineEndOffset(line - 1) - start)
    }
}
