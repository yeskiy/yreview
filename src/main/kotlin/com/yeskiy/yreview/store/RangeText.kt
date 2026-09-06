package com.yeskiy.yreview.store

/**
 * The words that name the place of one comment.
 *
 * A line number is one based. A column is a zero based character position inside a line.
 * The end column names the character after the last character of the comment. A comment
 * on whole lines carries no column, and both columns are 0 there.
 *
 * A text that a person reads writes the word character. A field name that a machine reads
 * writes the word column. The two words name the same thing.
 *
 * The rule reads plain values, so a test runs it without a running IDE.
 */
object RangeText {

    /** True when the range names a part of a line. */
    fun hasColumns(startColumn: Int?, endColumn: Int?): Boolean =
        (startColumn ?: 0) != 0 || (endColumn ?: 0) != 0

    /** The short form. Whole lines read as `88-94`, and a part of a line as `88:4-94:9`. */
    fun compact(startLine: Int, startColumn: Int?, endLine: Int, endColumn: Int?): String =
        if (hasColumns(startColumn, endColumn)) {
            "$startLine:${startColumn ?: 0}-$endLine:${endColumn ?: 0}"
        } else {
            "$startLine-$endLine"
        }

    fun compact(range: Range): String =
        compact(range.startLine, range.startColumn, range.endLine, range.endColumn)

    /** The words of a card. They name the lines always, and the characters of a part. */
    fun words(startLine: Int, startColumn: Int?, endLine: Int, endColumn: Int?): String {
        val start = startColumn ?: 0
        val end = endColumn ?: 0
        return when {
            !hasColumns(start, end) -> "lines $startLine-$endLine"
            startLine == endLine -> "lines $startLine-$endLine, from character $start to character $end"
            else -> "lines $startLine-$endLine, from character $start of line $startLine " +
                "to character $end of line $endLine"
        }
    }

    fun words(range: Range): String =
        words(range.startLine, range.startColumn, range.endLine, range.endColumn)
}

/** The first character of a range, or null when the range covers whole lines. */
fun Range.startColumnOrNull(): Int? = startColumn.takeIf { RangeText.hasColumns(startColumn, endColumn) }

/** The last character of a range, or null when the range covers whole lines. */
fun Range.endColumnOrNull(): Int? = endColumn.takeIf { RangeText.hasColumns(startColumn, endColumn) }
