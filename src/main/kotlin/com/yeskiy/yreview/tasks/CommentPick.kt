package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.StoredComment

/** One record that a scan read, and whether somebody already resolved it. */
data class ScanRecord(val stored: StoredComment, val resolved: Boolean)

/**
 * Which records one scan of the review comments keeps.
 *
 * The scan reads the open records always. It reads the resolved records as well while the
 * switch of the tab stands on. The switch therefore changes the scan and not the rendered
 * rows alone, so the count of the tab follows it.
 */
object CommentPick {

    fun of(
        open: List<StoredComment>,
        closed: List<StoredComment>,
        showResolved: Boolean,
    ): List<ScanRecord> =
        open.map { ScanRecord(it, false) } +
            if (showResolved) closed.map { ScanRecord(it, true) } else emptyList()
}

/**
 * The word that one review comment row shows after its title.
 *
 * A resolved record shows that one word, because a user who opened the resolved switch
 * reads the tree for that difference. A record of the local ref never reaches a remote. A
 * record of a folder store has no remote to reach, and neither has a record whose push
 * failed.
 */
object CommentWord {

    const val RESOLVED = "resolved"

    const val LOCAL = "local"

    const val NOT_SHARED = "not shared"

    const val SHARED = "shared"

    fun of(shared: Boolean, worktree: Boolean, unshared: Boolean, resolved: Boolean): String = when {
        resolved -> RESOLVED
        !shared -> LOCAL
        worktree -> NOT_SHARED
        unshared -> NOT_SHARED
        else -> SHARED
    }
}
