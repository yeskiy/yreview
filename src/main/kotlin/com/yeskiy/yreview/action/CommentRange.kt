package com.yeskiy.yreview.action

import com.yeskiy.yreview.store.Range

/**
 * The rule that turns one selection of an editor into the range of a comment.
 *
 * A line number is one based. A column is a zero based character position inside a line.
 * The end column names the character after the last character of the selection.
 *
 * A selection of whole lines carries no column, and a caret carries none either. Both
 * columns stay 0 there, so the stored record holds no column field.
 *
 * The rule reads plain values, so a test runs it without a running IDE.
 */
object CommentRange {

    /**
     * The range of one selection.
     *
     * [endLineLength] is the number of characters of the line that holds the end of the
     * selection, without its line break.
     */
    fun of(startLine: Int, startColumn: Int, endLine: Int, endColumn: Int, endLineLength: Int): Range =
        if (wholeLines(startLine, startColumn, endLine, endColumn, endLineLength)) {
            Range(startLine = startLine, endLine = endLine)
        } else {
            Range(startLine = startLine, startColumn = startColumn, endLine = endLine, endColumn = endColumn)
        }

    /**
     * True when the selection covers whole lines.
     *
     * An empty selection is a caret, and a caret names one whole line. A selection that
     * starts at the first character of a line and ends at the first character of a line
     * covers whole lines. A selection that ends at the last character of a line covers the
     * whole text of that line, so it counts the same way.
     */
    private fun wholeLines(
        startLine: Int,
        startColumn: Int,
        endLine: Int,
        endColumn: Int,
        endLineLength: Int,
    ): Boolean =
        (startLine == endLine && startColumn == endColumn) ||
            (startColumn == 0 && (endColumn == 0 || endColumn == endLineLength))
}
