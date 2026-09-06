package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.store.StoredComment

object CommentIndex {

    /** Groups the comments of one file by the first line of their range. Line numbers are 1-based. */
    fun byStartLine(comments: List<StoredComment>, path: String): Map<Int, List<StoredComment>> =
        comments.mapNotNull { stored -> spanOf(stored, path)?.let { it.first to stored } }
            .groupBy({ it.first }, { it.second })

    /**
     * The line spans that the comments of one file cover. Two spans that touch or overlap become
     * one span, so no line ever carries two marks. Line numbers are 1-based.
     *
     * The merge keeps one list and writes the last entry again, so the cost grows with the
     * number of spans and not with the square of it. A file can hold one comment for every
     * line of it, and a new list for each step would copy the whole answer every time.
     */
    fun lineSpans(comments: List<StoredComment>, path: String): List<IntRange> =
        comments.mapNotNull { spanOf(it, path) }
            .sortedWith(compareBy({ it.first }, { it.last }))
            .fold(mutableListOf<IntRange>()) { merged, span ->
                val open = merged.lastOrNull()
                if (open != null && span.first <= open.last + 1) {
                    merged[merged.lastIndex] = IntRange(open.first, maxOf(open.last, span.last))
                } else {
                    merged.add(span)
                }
                merged
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
