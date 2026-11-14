package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.InlayProperties
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.util.Disposer
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.RangeText
import com.yeskiy.yreview.ui.ReviewColors

/** The document offsets that one comment covers. [wholeLines] paints the full width of each line. */
data class CommentPlace(val start: Int, val end: Int, val wholeLines: Boolean)

/** One painted piece and the number of open comments that cover it. */
data class CommentLayer(val start: Int, val end: Int, val depth: Int, val wholeLines: Boolean)

/** One change of the two counts at one position of a sweep. */
private data class Step(val at: Int, val text: Int, val lines: Int)

/** One stretch of a sweep with the counts that hold over the whole stretch. */
private data class Stretch(val from: Int, val to: Int, val text: Int, val lines: Int)

/** What one repaint drew in one editor: the highlighters and the count marks. */
data class Drawn(val highlighters: List<RangeHighlighter>, val inlays: List<Inlay<*>>) {

    fun clear(editor: Editor) {
        highlighters.forEach { editor.markupModel.removeHighlighter(it) }
        inlays.filter { it.isValid }.forEach { Disposer.dispose(it) }
    }

    companion object {
        val NONE = Drawn(emptyList(), emptyList())
    }
}

/**
 * Paints the open comments of one file: the characters of a comment with columns, else whole lines.
 * A piece of two or more comments takes the overlap color and shows its count after its last line.
 */
object CommentLayers {

    /** Both layers stay under the caret row. A piece of text sits over a whole line. */
    private const val TEXT_LAYER = HighlighterLayer.CARET_ROW - 1

    private const val LINE_LAYER = HighlighterLayer.CARET_ROW - 2

    fun paint(editor: Editor, ranges: List<Range>): Drawn {
        val layers = layersOf(editor.document, ranges)
        val highlighters = layers.map { layer ->
            val area = if (layer.wholeLines) HighlighterTargetArea.LINES_IN_RANGE else HighlighterTargetArea.EXACT_RANGE
            val key = if (layer.depth > 1) ReviewColors.COMMENT_OVERLAP else ReviewColors.COMMENT_RANGE
            editor.markupModel.addRangeHighlighter(
                key, layer.start, layer.end, if (layer.wholeLines) LINE_LAYER else TEXT_LAYER, area,
            )
        }
        val inlays = countsOf(editor.document, layers).mapNotNull { (offset, count) ->
            editor.inlayModel.addAfterLineEndElement(offset, InlayProperties(), CountRenderer(count.toString()))
        }
        return Drawn(highlighters, inlays)
    }

    /**
     * The line end offset and the count of each overlap piece, once for each pair. A piece of
     * text that ends at a line start counts on the line before.
     */
    fun countsOf(document: Document, layers: List<CommentLayer>): List<Pair<Int, Int>> =
        layers.filter { it.depth > 1 }
            .map { layer ->
                val line = document.getLineNumber(if (layer.wholeLines) layer.end else maxOf(layer.start, layer.end - 1))
                document.getLineEndOffset(line) to layer.depth
            }
            .distinct()
            .sortedBy { it.first }

    /**
     * The pieces to paint, whole lines first, from one sorted sweep. A piece of text also counts
     * the whole line comments of its line, because it paints over that line.
     */
    fun layersOf(document: Document, ranges: List<Range>): List<CommentLayer> {
        val places = ranges.mapNotNull { placeOf(document, it) }
        val (lines, texts) = places.partition { it.wholeLines }
        val lineSteps = lines.flatMap {
            listOf(Step(document.getLineNumber(it.start), 0, 1), Step(document.getLineNumber(it.end) + 1, 0, -1))
        }
        val textSteps = texts.flatMap { listOf(Step(it.start, 1, 0), Step(it.end, -1, 0)) } +
            lines.flatMap { listOf(Step(it.start, 0, 1), Step(it.end + 1, 0, -1)) }
        val lineLayers = sweep(lineSteps).map {
            CommentLayer(document.getLineStartOffset(it.from), document.getLineEndOffset(it.to - 1), it.lines, true)
        }
        val textLayers = sweep(textSteps).filter { it.text > 0 }
            .map { CommentLayer(it.from, it.to, it.text + it.lines, false) }
        return merge(lineLayers) + merge(textLayers)
    }

    /**
     * The offsets of one range, or null when it starts outside the document. An offset is line start
     * plus column, clamped to the line and the document. An empty clamp falls back to whole lines.
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

    /** The stretches between two positions where at least one comment is open. */
    private fun sweep(steps: List<Step>): List<Stretch> {
        val sorted = steps.sortedBy { it.at }
        val stretches = ArrayList<Stretch>()
        var text = 0
        var lines = 0
        var index = 0
        while (index < sorted.size) {
            val at = sorted[index].at
            while (index < sorted.size && sorted[index].at == at) {
                text += sorted[index].text
                lines += sorted[index].lines
                index++
            }
            if (index < sorted.size && text + lines > 0) stretches.add(Stretch(at, sorted[index].at, text, lines))
        }
        return stretches
    }

    /** Joins two neighbors of the same depth, so a long run paints as one highlighter. */
    private fun merge(layers: List<CommentLayer>): List<CommentLayer> =
        layers.fold(ArrayList<CommentLayer>()) { merged, layer ->
            val open = merged.lastOrNull()
            if (open != null && open.depth == layer.depth && joins(open, layer)) {
                merged[merged.lastIndex] = open.copy(end = layer.end)
            } else {
                merged.add(layer)
            }
            merged
        }

    private fun joins(open: CommentLayer, next: CommentLayer): Boolean =
        if (open.wholeLines) next.start <= open.end + 1 else next.start == open.end
}
