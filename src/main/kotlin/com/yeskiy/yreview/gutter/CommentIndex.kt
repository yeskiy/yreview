package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.store.Carry
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.shown
import com.yeskiy.yreview.tasks.Placed

object CommentIndex {

    /** Groups the shown comments by the first line of their place. Line numbers are 1-based. */
    fun byStartLine(placed: List<Placed>): Map<Int, List<Placed>> =
        placed.mapNotNull { entry -> entry.carry.shown?.let { minOf(it.startLine, it.endLine) to entry } }
            .groupBy({ it.first }, { it.second })

    /** The ranges of the comments whose lines did not change. Only these join the overlap count. */
    fun ranges(placed: List<Placed>): List<Range> = placed.mapNotNull { (it.carry as? Carry.Same)?.range }

    /** The ranges of the outdated comments, which get the dim color. */
    fun dim(placed: List<Placed>): List<Range> = placed.mapNotNull { (it.carry as? Carry.Outdated)?.range }

    /** The last shown line of these comments. The card of the editor sits under it. */
    fun lastShownLine(placed: List<Placed>): Int =
        placed.mapNotNull { it.carry.shown }.maxOfOrNull { maxOf(it.startLine, it.endLine) } ?: 0

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

}
