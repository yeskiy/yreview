package com.yeskiy.yreview.session

import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import java.nio.file.Files

/**
 * Holds the answer of one search for a Node installation.
 *
 * The answer belongs to the machine, so the search runs once for the whole application.
 * The settings page asks first, and a session asks again when it starts.
 */
@Service(Service.Level.APP)
class NodeDetection {

    private val answer: NodeInstall by lazy { search() }

    fun install(): NodeInstall = answer

    /**
     * [PathEnvironmentVariableUtil.findExecutableInPathOnAnyOS] reads the PATHEXT variable
     * on Windows, so it finds node.exe as well.
     */
    private fun search(): NodeInstall = NodeSearch.of(
        onPath = PathEnvironmentVariableUtil.findExecutableInPathOnAnyOS(NodeSearch.COMMAND)?.absolutePath,
        files = NodeSearch.candidates(System.getenv("ProgramFiles")),
        exists = { Files.isRegularFile(it) },
    )

    companion object {
        fun getInstance(): NodeDetection = ApplicationManager.getApplication().service<NodeDetection>()
    }
}
