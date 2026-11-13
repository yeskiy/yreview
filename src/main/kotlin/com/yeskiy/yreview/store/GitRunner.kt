package com.yeskiy.yreview.store

import com.intellij.openapi.progress.ProgressManager
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

data class GitResult(val exitCode: Int, val stdout: String, val stderr: String) {

    val ok: Boolean get() = exitCode == 0

    /**
     * True when git itself gave this exit code. A false answer comes from the runner and states
     * nothing about the repository, so a caller that reads a fact out of a failed run tests this first.
     */
    val ran: Boolean get() = exitCode >= 0

    /** True when the runner stopped git, because the run passed its time limit. */
    val timedOut: Boolean get() = exitCode == TIMED_OUT

    companion object {

        /** The exit code of an answer that no git process made. A git exit code is not negative. */
        const val DID_NOT_START = -2

        /** The exit code of an answer the runner refused, because one stream passed its limit. */
        const val TOO_MUCH_OUTPUT = -1

        /** The exit code of an answer the runner refused, because git ran longer than the limit. */
        const val TIMED_OUT = -3
    }
}

interface GitRunner {
    fun run(vararg args: String): GitResult
}

/**
 * Runs git in one working directory. The run waits in short slices and calls [checkCanceled]
 * after each slice. On a cancel or after [waitMillis], it stops git and every child of git.
 */
class ProcessGitRunner(
    private val workingDir: File,
    private val exePath: String = "git",
    private val waitMillis: Long = WAIT_MILLIS,
    private val checkCanceled: () -> Unit = { ProgressManager.checkCanceled() },
) : GitRunner {

    override fun run(vararg args: String): GitResult {
        val process = try {
            ProcessBuilder(listOf(exePath) + args).directory(workingDir).start()
        } catch (failure: IOException) {
            return NO_GIT
        } catch (failure: SecurityException) {
            return NO_GIT
        }
        // Both pipes drain at the same time. A full pipe with no reader stops the child process.
        val streams = listOf(process.inputStream, process.errorStream).map { READERS.submit<String?> { read(process, it) } }
        try {
            return answer(process, streams)
        } catch (stop: Throwable) {
            stopTree(process)
            throw stop
        }
    }

    private fun answer(process: Process, streams: List<Future<String?>>): GitResult {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(waitMillis)
        while (!process.waitFor(SLICE_MILLIS, TimeUnit.MILLISECONDS)) {
            checkCanceled()
            if (System.nanoTime() > deadline) return stopped(process)
        }
        // A child process of git can keep a pipe open after git ends, so this wait has the same bound.
        val texts = streams.map { stream ->
            try {
                stream.get(maxOf(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS)
            } catch (late: TimeoutException) {
                return stopped(process)
            } catch (broken: ExecutionException) {
                null
            }
        }
        if (texts.any { it == null }) return REFUSED_OUTPUT
        return GitResult(process.exitValue(), texts[0].orEmpty(), texts[1].orEmpty())
    }

    private fun stopped(process: Process): GitResult {
        stopTree(process)
        return GitResult(
            GitResult.TIMED_OUT,
            "",
            "Git did not stop in ${waitMillis / 1000} seconds, so the plugin stopped it. " +
                "Git can wait for a password or for a credential window. Make sure that git runs without input.",
        )
    }

    /**
     * Reads one stream up to the limit, and stops the process at the limit. The answer is then
     * null, because a part of a note reads as a whole note.
     */
    private fun read(process: Process, stream: InputStream): String? {
        val collected = ByteArrayOutputStream()
        val chunk = ByteArray(CHUNK_BYTES)
        stream.use {
            while (true) {
                val count = it.read(chunk)
                if (count < 0) break
                if (collected.size() + count > MAX_OUTPUT_BYTES) {
                    stopTree(process)
                    return null
                }
                collected.write(chunk, 0, count)
            }
        }
        return collected.toString(Charsets.UTF_8)
    }

    companion object {
        /** The most bytes that one git stream may write. `git notes list` writes about 90 bytes for each note. */
        const val MAX_OUTPUT_BYTES = 16 * 1024 * 1024

        /** The longest time that one git run may take. A push over the network takes the most time. */
        const val WAIT_MILLIS = 120_000L

        private const val SLICE_MILLIS = 100L

        private const val CHUNK_BYTES = 64 * 1024

        private val READERS = Executors.newCachedThreadPool { task ->
            Thread(task, "y-review git reader").apply { isDaemon = true }
        }

        private fun stopTree(process: Process) {
            process.descendants().forEach { it.destroyForcibly() }
            process.destroyForcibly()
        }

        /** The answer of a run that never started. The message names no path, because the user reads it. */
        private val NO_GIT = GitResult(
            GitResult.DID_NOT_START,
            "",
            "The plugin could not start git. Set the path to git under Settings, Version Control, Git.",
        )

        private val REFUSED_OUTPUT = GitResult(
            GitResult.TOO_MUCH_OUTPUT,
            "",
            "The git command wrote more than $MAX_OUTPUT_BYTES bytes. " +
                "The plugin stopped the command and refused the answer.",
        )
    }
}
