package com.yeskiy.ideareview.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Builds the command line of a review session. The plugin owns it, so a session it starts
 * always carries the IDE server, the review channel, and the pinned project.
 */
object ClaudeCommand {

    const val LAUNCHER = "claude"
    const val CHANNEL = "server:idea-review"
    const val SERVER_URL = "http://127.0.0.1:64342/stream"
    const val PROJECT_HEADER = "IJ_MCP_SERVER_PROJECT_PATH"

    private val WSL_PATH = Regex("^/mnt/([a-zA-Z])(/.*)?$")

    /** The form the IDE server accepts. A WSL path is refused there, so it is converted. */
    fun windowsPath(raw: String): String {
        val slashes = raw.replace('\\', '/')
        val windows = WSL_PATH.matchEntire(slashes)
            ?.let { it.groupValues[1].uppercase() + ":" + it.groupValues[2].ifEmpty { "/" } }
            ?: slashes
        return if (windows.length > 3 && windows.endsWith("/")) windows.dropLast(1) else windows
    }

    fun mcpConfig(projectPath: String): String = Json.encodeToString(
        buildJsonObject {
            putJsonObject("mcpServers") {
                putJsonObject("idea") {
                    put("type", "http")
                    put("url", SERVER_URL)
                    putJsonObject("headers") { put(PROJECT_HEADER, windowsPath(projectPath)) }
                }
            }
        }
    )

    fun arguments(projectPath: String): List<String> = listOf(
        LAUNCHER,
        "--mcp-config",
        mcpConfig(projectPath),
        "--dangerously-load-development-channels",
        CHANNEL
    )

    /**
     * The launcher is a PowerShell function, so the session runs as one PowerShell line.
     * Every argument that is not a flag is quoted, and a quote inside it is doubled.
     */
    fun shellLine(projectPath: String): String = arguments(projectPath)
        .joinToString(" ") { if (it.startsWith("--") || it == LAUNCHER) it else quote(it) }

    fun shellCommand(projectPath: String): List<String> =
        listOf("powershell.exe", "-NoLogo", "-NoExit", "-Command", shellLine(projectPath))

    private fun quote(value: String): String = "'" + value.replace("'", "''") + "'"
}
