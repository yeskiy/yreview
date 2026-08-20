package com.yeskiy.ideareview.store

import java.io.File
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
        val errors = CompletableFuture.supplyAsync { process.errorStream.bufferedReader().readText() }
        val stdout = process.inputStream.bufferedReader().readText()
        return GitResult(process.waitFor(), stdout, errors.get())
    }
}
