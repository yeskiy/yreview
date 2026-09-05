package com.yeskiy.yreview.settings

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/** What one run of a command gave back. */
data class CommandAnswer(val exitCode: Int, val output: String, val timedOut: Boolean) {
    val ok: Boolean get() = !timedOut && exitCode == 0
}

/**
 * Runs one short command and waits a bounded time for the answer.
 *
 * The settings page runs the command that registers the review server. Such a command can
 * ask for input, and it then never ends. The wait therefore has a bound. The plugin stops
 * a process over that bound, and the answer says so.
 *
 * The caller runs this away from the user interface thread, because one call can take the
 * whole bound.
 */
object CommandRun {

    /** The longest one command may run before the plugin stops it. */
    const val WAIT_MILLIS = 20000L

    /**
     * The most bytes of output that one answer carries. The reader drains the rest and
     * drops it, so a chatty command fills no memory and blocks on no pipe.
     */
    const val MAX_OUTPUT_BYTES = 64 * 1024

    private const val CHUNK_BYTES = 8 * 1024

    private const val STOPPED_CODE = -1

    private val STOPPED = CommandAnswer(STOPPED_CODE, "", timedOut = true)

    /**
     * Starts the command, waits up to [waitMillis], and stops a process that runs longer.
     *
     * [start] names the way one process begins. The caller of the plugin keeps the default,
     * and a test passes its own, so the test holds the process and reads its state after.
     */
    fun run(
        parts: List<String>,
        waitMillis: Long = WAIT_MILLIS,
        start: (List<String>) -> Process = { ProcessBuilder(it).redirectErrorStream(true).start() },
    ): CommandAnswer {
        val process = start(parts)
        // The pipe is read on another thread. A read to the end on this thread would wait
        // with no bound, because a process that asks for input closes nothing.
        val output = CompletableFuture.supplyAsync { read(process.inputStream) }
        if (!process.waitFor(waitMillis, TimeUnit.MILLISECONDS)) {
            process.destroyForcibly().waitFor()
            return STOPPED
        }
        return CommandAnswer(
            process.exitValue(),
            runCatching { output.get(waitMillis, TimeUnit.MILLISECONDS) }.getOrDefault(""),
            timedOut = false,
        )
    }

    /**
     * Reads the stream to its end and keeps the first bytes up to the limit.
     *
     * This method drains the pipe. A process that fills the pipe and finds no reader stops,
     * and the wait then reaches its bound for a command that works.
     */
    private fun read(stream: InputStream): String {
        val kept = ByteArrayOutputStream()
        val chunk = ByteArray(CHUNK_BYTES)
        stream.use {
            while (true) {
                val count = it.read(chunk)
                if (count < 0) break
                val room = MAX_OUTPUT_BYTES - kept.size()
                if (room > 0) kept.write(chunk, 0, minOf(count, room))
            }
        }
        return kept.toString(Charsets.UTF_8).trim()
    }
}
