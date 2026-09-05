package com.yeskiy.yreview.store

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.CompletableFuture

data class GitResult(val exitCode: Int, val stdout: String, val stderr: String) {

    val ok: Boolean get() = exitCode == 0

    /**
     * True when a git process ran and gave this exit code.
     *
     * A false answer means that git never started, so the answer states nothing about the
     * repository. A caller that reads a fact out of a failed run tests this first.
     */
    val ran: Boolean get() = exitCode != DID_NOT_START

    companion object {

        /** The exit code of an answer that no git process made. A git exit code is not negative. */
        const val DID_NOT_START = -2
    }
}

interface GitRunner {
    fun run(vararg args: String): GitResult
}

/**
 * Runs the git executable in one working directory. Inside the IDE the path comes from
 * the version control settings, so the plugin uses the same git the user configured.
 */
class ProcessGitRunner(
    private val workingDir: File,
    private val exePath: String = "git",
) : GitRunner {

    override fun run(vararg args: String): GitResult {
        val process = try {
            ProcessBuilder(listOf(exePath) + args).directory(workingDir).start()
        } catch (failure: IOException) {
            return NO_GIT
        } catch (failure: SecurityException) {
            return NO_GIT
        }
        // Both pipes are drained at the same time. Reading one to the end while the other
        // fills its buffer deadlocks the child process.
        val errors = CompletableFuture.supplyAsync { read(process, process.errorStream) }
        val stdout = read(process, process.inputStream)
        // A stopped process closes the error pipe, and the reader of that pipe then fails.
        val stderr = if (stdout == null) runCatching { errors.get() }.getOrNull() else errors.get()
        val exitCode = process.waitFor()
        if (stdout == null || stderr == null) return TOO_MUCH_OUTPUT
        return GitResult(exitCode, stdout, stderr)
    }

    /**
     * Reads one stream up to the limit and stops the process at the limit. The answer is
     * null when the stream holds more bytes than the limit. The caller never gets a text
     * that stops in the middle, because a part of a note reads as a whole note.
     */
    private fun read(process: Process, stream: InputStream): String? {
        val collected = ByteArrayOutputStream()
        val chunk = ByteArray(CHUNK_BYTES)
        stream.use {
            while (true) {
                val count = it.read(chunk)
                if (count < 0) break
                if (collected.size() + count > MAX_OUTPUT_BYTES) {
                    process.destroyForcibly()
                    return null
                }
                collected.write(chunk, 0, count)
            }
        }
        return collected.toString(Charsets.UTF_8)
    }

    companion object {
        /**
         * The most bytes that one git stream may write. A note holds review comments, and
         * `git notes list` writes about 90 bytes for each note. This limit therefore
         * allows about 180000 notes.
         */
        const val MAX_OUTPUT_BYTES = 16 * 1024 * 1024

        private const val CHUNK_BYTES = 64 * 1024

        private const val TOO_MUCH_OUTPUT_CODE = -1

        /**
         * The answer of a run that never started. Git is missing, or the system refused it.
         *
         * The message names no path, because the user reads it. The caller still gets a
         * failed answer, so a write refuses and states the reason.
         */
        private val NO_GIT = GitResult(
            GitResult.DID_NOT_START,
            "",
            "The plugin could not start git. Set the path to git under Settings, Version Control, Git.",
        )

        private val TOO_MUCH_OUTPUT = GitResult(
            TOO_MUCH_OUTPUT_CODE,
            "",
            "The git command wrote more than $MAX_OUTPUT_BYTES bytes. " +
                "The plugin stopped the command and refused the answer.",
        )
    }
}
