package com.yeskiy.yreview.session

import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import java.nio.file.Files

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
     * [PathEnvironmentVariableUtil.findExecutableInPathOnAnyOS] reads the PATHEXT variable
     * on Windows, so it finds claude.exe, claude.cmd and claude.bat as well.
     */
    private fun search(): ClaudeInstall = ClaudeSearch.of(
        onPath = PathEnvironmentVariableUtil.findExecutableInPathOnAnyOS(ClaudeSearch.COMMAND)?.absolutePath,
        files = ClaudeSearch.candidates(System.getProperty("user.home"), System.getenv("APPDATA")),
        exists = { Files.isRegularFile(it) },
    )

    companion object {
        fun getInstance(): ClaudeDetection = ApplicationManager.getApplication().service<ClaudeDetection>()
    }
}
