package com.yeskiy.yreview.session

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

/**
 * Holds the answer of one search for a Claude Code installation.
 *
 * The answer belongs to the machine, so the search runs once for the whole application.
 * The tool window factory asks first, and the platform calls that factory away from the
 * user interface thread.
 */
@Service(Service.Level.APP)
class ClaudeDetection {

    private val answer: ClaudeInstall by lazy { search() }

    fun install(): ClaudeInstall = answer

    /**
     * [PathLookup] reads the PATHEXT variable on Windows, so it finds claude.exe, claude.cmd
     * and claude.bat as well.
     */
    private fun search(): ClaudeInstall = ClaudeSearch.of(
        onPath = PathLookup.find(
            command = ClaudeSearch.COMMAND,
            path = System.getenv("PATH"),
            separator = File.pathSeparatorChar,
            windows = ClaudeCommand.onWindows(),
            pathExt = System.getenv("PATHEXT"),
            runnable = ::runnable,
        )?.toAbsolutePath()?.toString(),
        files = ClaudeSearch.candidates(System.getProperty("user.home"), System.getenv("APPDATA")),
        exists = { Files.isRegularFile(it) },
    )

    /** A file that the operating system can start. The search reports such a file only. */
    private fun runnable(file: Path): Boolean =
        Files.isRegularFile(file) && Files.isReadable(file) && Files.isExecutable(file)

    companion object {
        fun getInstance(): ClaudeDetection = ApplicationManager.getApplication().service<ClaudeDetection>()
    }
}
