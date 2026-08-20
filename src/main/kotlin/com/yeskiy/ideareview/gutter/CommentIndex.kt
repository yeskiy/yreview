package com.yeskiy.ideareview.gutter

import com.yeskiy.ideareview.store.StoredComment

object CommentIndex {

    /** Groups the comments of one file by the first line of their range. Line numbers are 1-based. */
    fun byStartLine(comments: List<StoredComment>, path: String): Map<Int, List<StoredComment>> =
        comments.mapNotNull { stored ->
            val location = stored.comment.location ?: return@mapNotNull null
            if (location.path != path) return@mapNotNull null
            val range = location.range ?: return@mapNotNull null
            range.startLine to stored
        }.groupBy({ it.first }, { it.second })
}
