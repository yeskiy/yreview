package com.yeskiy.yreview.store

data class ShareResult(val ok: Boolean, val message: String)

/**
 * Pushes a shared note ref to the remote and adds the fetch refspec once, so the notes
 * other people write come back with the next fetch. A failure leaves the note where it is.
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
        if (writeRefspec) {
            val configured = addFetchRefspec()
            if (!configured.ok) return failure(configured, "The fetch refspec was not added.")
        }
        val pushed = git.run("push", remote, ref)
        return if (pushed.ok) ShareResult(true, "") else failure(pushed, "The push failed.")
    }

    private fun addFetchRefspec(): GitResult {
        val current = git.run("config", "--get-all", "remote.$remote.fetch")
        if (current.ok && current.stdout.lineSequence().any { it.trim() == FETCH_REFSPEC }) return current
        return git.run("config", "--add", "remote.$remote.fetch", FETCH_REFSPEC)
    }

    private fun failure(result: GitResult, fallback: String) =
        ShareResult(false, result.stderr.trim().ifEmpty { fallback })

    companion object {

        const val FETCH_REFSPEC = "+refs/notes/devtools/*:refs/notes/devtools/*"

        /** The name that git gives the first remote of a clone. */
        const val DEFAULT_REMOTE = "origin"
    }
}
