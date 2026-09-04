package com.yeskiy.yreview.ui

import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.StoredComment

/** Every line of text that a comment popup shows. The popups keep no text rule of their own. */
object CommentText {

    const val EMPTY_MESSAGE = "Write the comment first."

    /** The header of the popup. It names the file and the line range. */
    fun header(path: String, startLine: Int, endLine: Int): String = "$path:$startLine-$endLine"

    /** The same header for one side of a diff, with the revision that the comment anchors to. */
    fun diffHeader(path: String, startLine: Int, endLine: Int, commit: String, dirty: Boolean): String =
        "${header(path, startLine, endLine)} @${short(commit)}${if (dirty) " (working tree)" else ""}"

    /**
     * The tooltip of the share box. A folder store reaches no remote, so the box states when
     * a shared comment gets there.
     */
    fun shareTooltip(canPush: Boolean): String =
        if (canPush) {
            "The plugin pushes a shared comment to the remote that the settings name. " +
                "A comment that you do not share stays in this repository."
        } else {
            "No git repository covers this file, so the plugin cannot push yet. " +
                "A shared comment reaches the remote after the comments move into the git notes."
        }

    /** Returns the message to show, or null when the plugin can save the text. */
    fun errorOf(text: String): String? = if (text.isBlank()) EMPTY_MESSAGE else null

    /** The place a stored comment points at. */
    fun location(stored: StoredComment): String {
        val place = stored.comment.location ?: return "no location"
        return "${range(place)} @${short(place.commit)}"
    }

    /** The author of a stored comment, and the ref that holds it. */
    fun signature(stored: StoredComment): String =
        "${stored.comment.author}, ${if (NoteRefs.isShared(stored.ref)) "shared" else "local"}"

    /** One line for a tooltip or for a list row. */
    fun summary(stored: StoredComment): String {
        val range = stored.comment.location?.range
        return "${range?.startLine}-${range?.endLine}: ${firstLine(stored)}"
    }

    private fun range(place: Location): String =
        place.range?.let { header(place.path, it.startLine, it.endLine) } ?: place.path

    private fun firstLine(stored: StoredComment): String =
        stored.comment.description?.lineSequence()?.firstOrNull().orEmpty()

    /** The seven character prefix of a commit. A record of a folder store names no commit. */
    private fun short(commit: String): String =
        if (commit == FolderStore.WORKTREE) "working tree" else commit.take(7)
}
