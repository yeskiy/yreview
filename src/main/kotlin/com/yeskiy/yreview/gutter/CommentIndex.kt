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
