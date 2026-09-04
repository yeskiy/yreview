package com.yeskiy.yreview.bridge

import com.yeskiy.yreview.tasks.TaskLabels

/**
 * The route one send took.
 *
 * A route other than [CHANNEL] carries the reason the send went to the clipboard, so the
 * user never has to guess why the channel stayed out of the work.
 */
enum class SendRoute(val clipboardReason: String?) {
    CHANNEL(null),
    NO_SESSION("No Claude Code session reads this project"),
    CHANNEL_OFF("The review channel is off in the settings"),
    NO_REPOSITORY("The review channel carries the tasks of a git repository only"),
}

/**
 * Picks the route of one send.
 *
 * A folder store beats every other answer, because the channel names a branch and a
 * commit, and a folder that no git repository holds has neither. The switch of the user
 * comes next, and the number of readers comes last.
 */
object SendRoutes {

    fun of(channel: Boolean, readers: Int, gitRepository: Boolean): SendRoute = when {
        !gitRepository -> SendRoute.NO_REPOSITORY
        !channel -> SendRoute.CHANNEL_OFF
        readers > 0 -> SendRoute.CHANNEL
        else -> SendRoute.NO_SESSION
    }
}

/** What one press of Send did. */
data class SendReport(
    val tasks: Int,
    val batches: Int,
    val streams: Int,
    val problem: String? = null,
    val dropped: Int = 0,
    val dropReason: String? = null,
    val route: SendRoute = SendRoute.CHANNEL,
    val folder: String? = null,
)

/** One line for the user, and whether it reports a problem. */
data class Notice(val text: String, val warning: Boolean)

/**
 * Turns a send into one sentence.
 *
 * A send that reaches no session looks the same as a send that works, so the message says
 * plainly that nobody read it. A task the channel refuses is a loss the user must see, so
 * the message names the count and the reason.
 */
object SendMessages {

    fun of(report: SendReport): Notice = when {
        report.problem != null -> Notice(report.problem, warning = true)
        report.tasks == 0 && report.dropped == 0 -> Notice("This repository has no open task.", warning = false)
        report.route.clipboardReason != null -> Notice(
            "${report.route.clipboardReason}, so the IDE wrote ${TaskLabels.count(report.tasks, "task")} " +
                "to ${report.folder} and copied the prompt to the clipboard." + lost(report),
            warning = false,
        )
        report.streams == 0 -> Notice(
            "No Claude Code session reads this project. " +
                "Start a session with the review channel, then send the tasks again." + lost(report),
            warning = true,
        )
        else -> Notice(
            "The IDE sent ${TaskLabels.count(report.tasks, "task")} to " +
                "${TaskLabels.count(report.streams, "session")}." + lost(report),
            warning = report.dropped > 0,
        )
    }

    private fun lost(report: SendReport): String {
        if (report.dropped == 0) return ""
        val verb = if (report.dropped == 1) "was" else "were"
        return " ${TaskLabels.count(report.dropped, "task")} $verb dropped, because ${report.dropReason}."
    }
}
