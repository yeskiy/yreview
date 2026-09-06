package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.endColumnOrNull
import com.yeskiy.yreview.store.startColumnOrNull

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

/**
 * The task of one review comment record.
 *
 * A record of whole lines carries no column, and the task then holds no column either.
 *
 * The rule reads plain values, so a test runs it without a running IDE.
 */
object CommentTask {

    /** Null when the record names no place, and null when it holds no text. */
    fun of(record: ScanRecord, rootPath: String, unshared: Boolean): ReviewTask? {
        val stored = record.stored
        val location = stored.comment.location ?: return null
        val text = stored.comment.description?.trim().orEmpty()
        if (text.isEmpty()) return null
        return ReviewTask(
            id = stored.id,
            kind = TaskKind.COMMENT,
            path = location.path,
            startLine = location.range?.startLine ?: 0,
            startColumn = location.range?.startColumnOrNull(),
            endLine = location.range?.endLine ?: 0,
            endColumn = location.range?.endColumnOrNull(),
            text = text,
            author = stored.comment.author,
            filePath = "$rootPath/${location.path}",
            rootPath = rootPath,
            revision = location.commit,
            state = CommentWord.of(
                shared = NoteRefs.isShared(stored.ref),
                worktree = stored.commit == FolderStore.WORKTREE,
                unshared = unshared,
                resolved = record.resolved,
            ),
        )
    }
}
