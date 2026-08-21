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
     */
    fun lineSpans(comments: List<StoredComment>, path: String): List<IntRange> =
        comments.mapNotNull { spanOf(it, path) }
            .sortedWith(compareBy({ it.first }, { it.last }))
            .fold(emptyList<IntRange>()) { merged, span ->
                val open = merged.lastOrNull()
                if (open != null && span.first <= open.last + 1) {
                    merged.dropLast(1) + listOf(IntRange(open.first, maxOf(open.last, span.last)))
                } else {
                    merged + listOf(span)
                }
            }

    private fun spanOf(stored: StoredComment, path: String): IntRange? {
        val location = stored.comment.location ?: return null
        if (location.path != path) return null
        val range = location.range ?: return null
        return minOf(range.startLine, range.endLine)..maxOf(range.startLine, range.endLine)
    }
}
