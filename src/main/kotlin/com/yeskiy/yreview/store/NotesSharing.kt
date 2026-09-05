package com.yeskiy.yreview.store

data class ShareResult(val ok: Boolean, val message: String)

/**
 * Pushes a shared note ref to the remote and adds the fetch refspec once, so the notes
 * other people write come back with the next fetch. A failure leaves the note where it is.
 *
 * The refspec carries no plus, because a refspec with a plus makes every fetch of that ref
 * forced. Git then replaces the local note ref with the value of the remote, and a comment
 * that no push carried becomes unreachable. Without the plus git refuses a fetch that is not
 * a fast forward, the local ref stays, and git names the ref that it refused.
 *
 * The push runs first and the refspec follows it. A push that failed therefore writes no
 * line into the git configuration file of the user.
 *
 * The refspec also needs a remote that git already holds. The settings hold plain text, and
 * git pushes to a path as well as to a name, so a push can answer well while no remote of
 * that name exists. A refspec under such a name would build a remote that the user never
 * made, and the next fetch of that user would then fail.
 *
 * The settings name the remote, because not every repository calls it origin. The settings
 * also hold the refspec switch. A user who keeps the git configuration file by hand clears
 * that switch, and the plugin then writes nothing into that file.
 */
class NotesSharing(
    private val git: GitRunner,
    private val remote: String = DEFAULT_REMOTE,
    private val writeRefspec: Boolean = true,
) {

    fun share(ref: String): ShareResult {
        val pushed = git.run("push", remote, ref)
        if (!pushed.ok) return failure(pushed, "The push failed.")
        if (!writeRefspec || !known()) return ShareResult(true, "")
        val configured = addFetchRefspec()
        return if (configured.ok) ShareResult(true, "") else failure(configured, "The fetch refspec was not added.")
    }

    /** True when git already holds a remote of this name. The push carried the note either way. */
    private fun known(): Boolean = git.run("remote", "get-url", remote).ok

    /**
     * Writes the safe refspec and drops the forced one that an older version wrote.
     *
     * Git reads the fetch list in order, and the first refspec that matches a ref decides the
     * update. A forced refspec that stands over the safe one therefore still overwrites the
     * local note ref, so the forced one goes first.
     */
    private fun addFetchRefspec(): GitResult {
        val dropped = git.run("config", "--unset-all", key(), GitValuePattern.exactly(FORCED_REFSPEC))
        if (!dropped.ok && dropped.exitCode != NOTHING_TO_UNSET) return dropped
        val current = git.run("config", "--get-all", key())
        if (current.ok && current.stdout.lineSequence().any { it.trim() == FETCH_REFSPEC }) return current
        return git.run("config", "--add", key(), FETCH_REFSPEC)
    }

    private fun key(): String = "remote.$remote.fetch"

    private fun failure(result: GitResult, fallback: String) =
        ShareResult(false, result.stderr.trim().ifEmpty { fallback })

    companion object {

        const val FETCH_REFSPEC = "refs/notes/devtools/*:refs/notes/devtools/*"

        /** The refspec that an older version of the plugin wrote. Every fetch of it is forced. */
        const val FORCED_REFSPEC = "+$FETCH_REFSPEC"

        /** The name that git gives the first remote of a clone. */
        const val DEFAULT_REMOTE = "origin"

        /** What `git config --unset-all` answers when no value matches. That is no failure. */
        private const val NOTHING_TO_UNSET = 5
    }
}
