package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.StoredComment

object CommentRow {

    fun format(stored: StoredComment, unshared: Boolean): String {
        val location = stored.comment.location
        val range = location?.range
        val head = stored.comment.description?.lineSequence()?.firstOrNull().orEmpty()
        return "${location?.path}:${range?.startLine}-${range?.endLine}  [${state(stored, unshared)}]  $head"
    }

    /** A comment of the local ref is never shared, so a failed push cannot change its state. */
    private fun state(stored: StoredComment, unshared: Boolean): String = when {
        !NoteRefs.isShared(stored.ref) -> "local"
        unshared -> "not shared"
        else -> "shared"
    }
}
