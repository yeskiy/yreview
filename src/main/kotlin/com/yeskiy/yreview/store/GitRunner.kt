package com.yeskiy.yreview.store

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.concurrent.CompletableFuture

data class GitResult(val exitCode: Int, val stdout: String, val stderr: String) {
    val ok: Boolean get() = exitCode == 0
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
        val process = ProcessBuilder(listOf(exePath) + args)
            .directory(workingDir)
            .start()
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

        private val TOO_MUCH_OUTPUT = GitResult(
            TOO_MUCH_OUTPUT_CODE,
            "",
            "The git command wrote more than $MAX_OUTPUT_BYTES bytes. " +
                "The plugin stopped the command and refused the answer.",
        )
    }
}
