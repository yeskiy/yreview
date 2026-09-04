package com.yeskiy.yreview.diagnostic

import com.yeskiy.yreview.bridge.SendReport
import com.yeskiy.yreview.session.BridgeDiscovery
import com.yeskiy.yreview.session.ChannelServer
import com.yeskiy.yreview.session.SessionPlan
import com.yeskiy.yreview.store.StoreKind
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * One thing the plugin did, in the form a user can paste into an issue.
 *
 * A record holds a version, a switch, a count, a route or a state, and nothing else. The
 * text of a comment, the author of a comment and the bridge token reach no field here.
 * [Redact] cleans the paths and the addresses that stay, and it runs on every route that
 * shows a record.
 */
sealed interface SessionRecord {

    /** The local time of the record, to the second. */
    val at: String

    /** The one word that names the kind of the record. */
    val label: String

    /** The facts of the record, in the order a reader needs them. */
    fun facts(): List<Pair<String, String>>

    fun text(): String =
        (listOf("[$at] $label") + facts().map { "  ${it.first.padEnd(WIDTH)} ${it.second}" }).joinToString("\n")

    /**
     * One start of a review session.
     *
     * The bridge token never reaches this record. The plan carries the token in the
     * environment map, and [of] reads the address of that map and no other value.
     */
    data class Session(
        override val at: String,
        val command: String,
        val workingDirectory: String,
        val bridgeReady: Boolean,
        val bridgeUrl: String,
        val status: String,
        val channelServer: String,
        val javaRuntime: String,
        val configFile: String,
        val terminalStarted: Boolean,
        val processId: Long?,
    ) : SessionRecord {

        override val label: String = "session start"

        override fun facts(): List<Pair<String, String>> = listOf(
            "command" to command,
            "directory" to workingDirectory,
            "bridge" to "${if (bridgeReady) "ready" else "not ready"} $bridgeUrl".trim(),
            "status" to status,
            "channel server" to channelServer,
            "java runtime" to javaRuntime,
            "config file" to configFile,
            "terminal" to if (terminalStarted) "started" else "not started",
            "process" to (processId?.toString() ?: UNKNOWN),
        )

        companion object {

            fun of(
                plan: SessionPlan,
                server: ChannelServer.Answer = ChannelServer.Answer.Unknown,
                javaPath: String? = null,
                configFile: String? = null,
                terminalStarted: Boolean = false,
                processId: Long? = null,
                now: LocalDateTime = LocalDateTime.now(),
            ): Session = Session(
                at = CLOCK.format(now),
                command = plan.command.joinToString(" "),
                workingDirectory = plan.workingDirectory,
                bridgeReady = plan.bridgeReady,
                bridgeUrl = plan.environment[BridgeDiscovery.URL_VARIABLE].orEmpty(),
                status = plan.status,
                channelServer = when (server) {
                    is ChannelServer.Answer.Found -> "found at ${server.path}"
                    is ChannelServer.Answer.Missing -> "missing at ${server.path}"
                    ChannelServer.Answer.Unknown -> UNKNOWN
                },
                javaRuntime = javaPath ?: NONE,
                configFile = configFile ?: NONE,
                terminalStarted = terminalStarted,
                processId = processId,
            )
        }
    }

    /**
     * One press of Send, and the route the tasks took.
     *
     * The record counts the tasks. It carries no task, because a task holds the text of a
     * review comment.
     */
    data class Send(
        override val at: String,
        val route: String,
        val store: String,
        val readers: Int,
        val tasks: Int,
        val batches: Int,
        val dropped: Int,
        val problem: String,
    ) : SessionRecord {

        override val label: String = "send"

        override fun facts(): List<Pair<String, String>> = listOf(
            "route" to route,
            "store" to store,
            "readers" to readers.toString(),
            "tasks" to tasks.toString(),
            "batches" to batches.toString(),
            "dropped" to dropped.toString(),
            "problem" to problem,
        )

        companion object {

            fun of(
                report: SendReport,
                store: StoreKind,
                readers: Int,
                now: LocalDateTime = LocalDateTime.now(),
            ): Send = Send(
                at = CLOCK.format(now),
                route = report.route.name.lowercase(),
                store = store.name.lowercase(),
                readers = readers,
                tasks = report.tasks,
                batches = report.batches,
                dropped = report.dropped,
                problem = report.problem ?: report.dropReason ?: NONE,
            )
        }
    }

    /** One failure of the plugin, named by the work that did not finish. */
    data class Failure(
        override val at: String,
        val work: String,
        val type: String,
        val message: String,
        val origin: String,
    ) : SessionRecord {

        override val label: String = "failure"

        override fun facts(): List<Pair<String, String>> = listOf(
            "work" to work,
            "type" to type,
            "message" to message,
            "origin" to origin,
        )

        companion object {

            /** The package of the plugin. The first frame of it says where the work stopped. */
            const val OWN_PACKAGE = "com.yeskiy.yreview"

            fun of(work: String, failure: Throwable, now: LocalDateTime = LocalDateTime.now()): Failure = Failure(
                at = CLOCK.format(now),
                work = work,
                type = failure::class.java.name,
                message = failure.message ?: NONE,
                origin = origin(failure),
            )

            /**
             * The first frame that names a class of this plugin.
             *
             * A frame of the platform says nothing about a defect of the plugin, and the
             * whole stack belongs in the error report and not in a record.
             */
            private fun origin(failure: Throwable): String =
                failure.stackTrace.firstOrNull { it.className.startsWith(OWN_PACKAGE) }?.toString() ?: UNKNOWN
        }
    }

    companion object {

        const val NONE = "none"

        const val UNKNOWN = "unknown"

        /** The width of the name column. It keeps the values of every record in one line. */
        const val WIDTH = 14

        val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
    }
}
