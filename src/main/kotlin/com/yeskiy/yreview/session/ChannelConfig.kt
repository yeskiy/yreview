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

    private const val PREFIX = "y-review-mcp-"

    private const val SUFFIX = ".json"

    private const val STDIO = "stdio"

    private const val CLASS_PATH_FLAG = "-cp"

    private val JSON = Json { prettyPrint = true }

    @Serializable
    private data class Entry(val type: String, val command: String, val args: List<String>)

    @Serializable
    private data class Document(val mcpServers: Map<String, Entry>)

    /**
     * [javaPath] is the launcher of the Java runtime that the IDE runs, and not the bare
     * command. Claude Code starts the server with a PATH of its own, so a full path always
     * runs. The class path holds one jar, and that jar holds every class of the server.
     */
    fun text(javaPath: String, serverPath: String): String =
        JSON.encodeToString(
            Document(
                mapOf(
                    AgentLaunch.SERVER_NAME to Entry(
                        STDIO,
                        javaPath,
                        listOf(CLASS_PATH_FLAG, serverPath, ChannelServer.MAIN_CLASS)
                    )
                )
            )
        )

    /** The caller owns the file, and it deletes the file when the session ends. */
    fun write(javaPath: String, serverPath: String): Path =
        Files.createTempFile(PREFIX, SUFFIX).also { it.writeText(text(javaPath, serverPath)) }

    fun delete(file: Path?) {
        file ?: return
        runCatching { file.deleteIfExists() }
    }
}
