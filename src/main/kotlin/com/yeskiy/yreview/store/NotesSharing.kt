package com.yeskiy.yreview.store

/** The answer of a share. [needsRefspec] is true when the remote has no safe fetch refspec for the notes. */
data class ShareResult(val ok: Boolean, val message: String, val needsRefspec: Boolean = false)

/**
 * Pushes a shared note ref, and never writes the git configuration file of the user. [addFetchRefspec]
 * writes a refspec without a plus, and only for a known remote, so a fetch never drops a local note.
 */
class NotesSharing(
    private val git: GitRunner,
    private val remote: String = DEFAULT_REMOTE,
    private val writeRefspec: Boolean = true,
) {

    fun share(ref: String): ShareResult {
        val pushed = git.run("push", remote, ref)
        if (!pushed.ok) return failure(pushed, "The push failed.")
        return ShareResult(true, "", needsRefspec = writeRefspec && known() && !refspecInPlace())
    }

    /**
     * Writes the safe refspec and drops the forced one that an older version wrote. The caller
     * runs this only after the user agrees, and it repeats without a second entry.
     */
    fun addFetchRefspec(): ShareResult {
        if (!known()) return ShareResult(false, "Git has no remote with the name $remote.")
        val configured = writeFetchRefspec()
        return if (configured.ok) ShareResult(true, "") else failure(configured, "The fetch refspec was not added.")
    }

    /** True when git already holds a remote of this name. The push carried the note either way. */
    private fun known(): Boolean = git.run("remote", "get-url", remote).ok

    /** True when the safe refspec is in the fetch list and the forced one is not. */
    private fun refspecInPlace(): Boolean {
        val current = git.run("config", "--get-all", key())
        if (!current.ok) return !current.ran
        val values = current.stdout.lineSequence().map { it.trim() }.toList()
        return FETCH_REFSPEC in values && FORCED_REFSPEC !in values
    }

    /**
     * Git reads the fetch list in order, and the first refspec that matches a ref decides the
     * update. A forced refspec over the safe one still overwrites the local note ref, so it goes first.
     */
    private fun writeFetchRefspec(): GitResult {
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
