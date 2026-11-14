package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment

object CommentIndex {

    /** Groups the comments of one file by the first line of their range. Line numbers are 1-based. */
    fun byStartLine(comments: List<StoredComment>, path: String): Map<Int, List<StoredComment>> =
        comments.mapNotNull { stored -> spanOf(stored, path)?.let { it.first to stored } }
            .groupBy({ it.first }, { it.second })

    /** The ranges of the comments of one file. A comment without a range names no text. */
    fun ranges(comments: List<StoredComment>, path: String): List<Range> =
        comments.mapNotNull { stored -> stored.comment.location?.takeIf { it.path == path }?.range }

    /**
     * How many of [ranges] cover each of [lines]. The count is the ranges that start on or
     * before a line minus the ranges that end before it, so two sorted lists answer each line.
     */
    fun covers(ranges: List<Range>, lines: Set<Int>): Map<Int, Int> {
        val starts = ranges.map { minOf(it.startLine, it.endLine) }.sorted()
        val ends = ranges.map { maxOf(it.startLine, it.endLine) }.sorted()
        return lines.associateWith { line -> countAtMost(starts, line) - countAtMost(ends, line - 1) }
    }

    /** The number of entries of [sorted] that are not above [value]. */
    private tailrec fun countAtMost(sorted: List<Int>, value: Int, low: Int = 0, high: Int = sorted.size): Int {
        if (low >= high) return low
        val middle = (low + high) ushr 1
        return if (sorted[middle] <= value) countAtMost(sorted, value, middle + 1, high)
        else countAtMost(sorted, value, low, middle)
    }

    /**
     * The last line that these comments cover. The box of the editor sits under that line.
     * The answer is 0 when no comment of the list carries a line range.
     */
    fun lastLine(comments: List<StoredComment>): Int =
        comments.mapNotNull { it.comment.location?.range }
            .maxOfOrNull { maxOf(it.startLine, it.endLine) } ?: 0

    private fun spanOf(stored: StoredComment, path: String): IntRange? {
        val location = stored.comment.location ?: return null
        if (location.path != path) return null
        val range = location.range ?: return null
        return minOf(range.startLine, range.endLine)..maxOf(range.startLine, range.endLine)
    }
}
