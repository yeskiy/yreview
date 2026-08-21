package com.yeskiy.yreview.session

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.deleteIfExists
import kotlin.io.path.writeText

/**
 * Writes the Model Context Protocol configuration file of one review session.
 *
 * The file declares one stdio server, and the name of that server is y-review. The name
 * matters, because a channel event carries the server name to the model.
 *
 * The file holds no secret. The session hands the bridge address and the bridge token to
 * the server through the environment, and never through this file or a command line.
 */
object ChannelConfig {

    private const val PREFIX = "claude-y-review-mcp-"

    private const val SUFFIX = ".json"

    private const val STDIO = "stdio"

    private val JSON = Json { prettyPrint = true }

    @Serializable
    private data class Entry(val type: String, val command: String, val args: List<String>)

    @Serializable
    private data class Document(val mcpServers: Map<String, Entry>)

    /**
     * [nodePath] is the file that the search for Node found, and not the bare command.
     * Claude Code starts the server with a PATH of its own, so a full path always runs.
     */
    fun text(nodePath: String, serverPath: String): String =
        JSON.encodeToString(
            Document(mapOf(ClaudeCommand.SERVER_NAME to Entry(STDIO, nodePath, listOf(serverPath))))
        )

    /** The caller owns the file, and it deletes the file when the session ends. */
    fun write(nodePath: String, serverPath: String): Path =
        Files.createTempFile(PREFIX, SUFFIX).also { it.writeText(text(nodePath, serverPath)) }

    fun delete(file: Path?) {
        file ?: return
        runCatching { file.deleteIfExists() }
    }
}
