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
    NO_SESSION("No session reads this project"),
    CHANNEL_OFF("The review channel is off in the settings"),
    NO_REPOSITORY("The review channel carries the tasks of a git repository only"),
}

/**
 * Picks the route of one send.
 *
 * A folder store beats every other answer, because the channel names a branch and a
 * commit, and a folder that no git repository holds has neither. The switch of the user
 * comes next, and the number of receivers comes last.
 *
 * [receivers] counts the sessions that can take a send right now, over any transport. It
 * is NOT the number of open event streams. A session that answers a loopback port of its
 * own opens no stream and still counts. A session whose agent ignores a pushed message
 * does not count, even while a channel server of that session holds a stream.
 */
object SendRoutes {

    fun of(channel: Boolean, receivers: Int, gitRepository: Boolean): SendRoute = when {
        !gitRepository -> SendRoute.NO_REPOSITORY
        !channel -> SendRoute.CHANNEL_OFF
        receivers > 0 -> SendRoute.CHANNEL
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
    /** The name of the one session the user chose, or null when the send reached every one. */
    val targetName: String? = null,
    /** The label of the agent the session window runs, or null when the plugin does not know. */
    val agent: String? = null,
    /** False when that agent accepts no message into a running session. */
    val agentCanReceive: Boolean = true,
    /** True when the prompt went to the clipboard after a push that the session refused. */
    val copied: Boolean = false,
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
        report.problem != null -> Notice(report.problem + copied(report), warning = true)
        report.tasks == 0 && report.dropped == 0 -> Notice("This repository has no open task.", warning = false)
        report.route.clipboardReason != null -> Notice(
            "${reason(report)}, so the IDE wrote ${TaskLabels.count(report.tasks, "task")} " +
                "to ${report.folder} and copied the prompt to the clipboard." + lost(report),
            warning = false,
        )
        report.streams == 0 && report.targetName != null -> Notice(
            "${report.targetName} no longer reads this project, so the IDE sent nothing.",
            warning = true,
        )
        report.streams == 0 -> Notice(
            "No session reads this project. " +
                "Start a session with the review channel, then send the tasks again." + lost(report),
            warning = true,
        )
        report.targetName != null -> Notice(
            "The IDE sent ${TaskLabels.count(report.tasks, "task")} to ${report.targetName}." + lost(report),
            warning = report.dropped > 0,
        )
        else -> Notice(
            "The IDE sent ${TaskLabels.count(report.tasks, "task")} to " +
                "${TaskLabels.count(report.streams, "session")}." + lost(report),
            warning = report.dropped > 0,
        )
    }

    /** A push that failed still leaves the user a way out, so the notice names it. */
    private fun copied(report: SendReport): String =
        if (!report.copied) "" else " The IDE copied the prompt to the clipboard, so you can paste it."

    private fun lost(report: SendReport): String {
        if (report.dropped == 0) return ""
        val verb = if (report.dropped == 1) "was" else "were"
        return " ${TaskLabels.count(report.dropped, "task")} $verb dropped, because ${report.dropReason}."
    }

    /**
     * Why a send went to the clipboard. The route carries a general reason, and an agent
     * that accepts no message into a running session carries a reason of its own.
     */
    private fun reason(report: SendReport): String {
        val agent = report.agent
        if (report.route != SendRoute.NO_SESSION || agent == null) return report.route.clipboardReason.orEmpty()
        return if (report.agentCanReceive) {
            "No $agent session reads this project"
        } else {
            "$agent does not accept a message into a running session"
        }
    }
}
