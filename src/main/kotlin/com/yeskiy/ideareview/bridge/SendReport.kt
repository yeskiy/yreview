package com.yeskiy.ideareview.bridge

/** What one press of Send All Comments did. */
data class SendReport(
    val comments: Int,
    val batches: Int,
    val streams: Int,
    val problem: String? = null,
)

/** One line for the user, and whether it reports a problem. */
data class Notice(val text: String, val warning: Boolean)

/**
 * Turns a send into one sentence.
 *
 * A send that reaches no session looks the same as a send that works, so the message says
 * plainly that nobody read it.
 */
object SendMessages {

    fun of(report: SendReport): Notice = when {
        report.problem != null -> Notice(report.problem, warning = true)
        report.comments == 0 -> Notice("This repository has no open review comment.", warning = false)
        report.streams == 0 -> Notice(
            "No Claude Code session reads this project. " +
                "Start a session with the review channel, then send the comments again.",
            warning = true,
        )
        else -> Notice(
            "The IDE sent ${count(report.comments, "comment")} to ${count(report.streams, "session")}.",
            warning = false,
        )
    }

    private fun count(value: Int, name: String): String = "$value $name${if (value == 1) "" else "s"}"
}
