package com.yeskiy.yreview.store

/** The author of a new record. The author is part of the record identity, so it must come from git. */
object GitAuthor {

    fun of(runner: GitRunner): String {
        val answer = runner.run("config", "user.email")
        val email = answer.stdout.trim()
        if (answer.ok && email.isNotEmpty()) return email
        val reason = if (answer.ran) {
            "Git has no user.email. Set git user.name and user.email, for example with git config --global user.email."
        } else {
            "Git did not answer. Make sure that the plugin can start git. ${answer.stderr.trim()}"
        }
        throw NotesWriteException("The plugin wrote no comment, because it cannot get the author. $reason".trim())
    }
}
