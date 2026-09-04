package com.yeskiy.yreview.session

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlin.io.path.isRegularFile
import kotlin.io.path.readText

/**
 * Writes the Model Context Protocol configuration file of one agent.
 *
 * The file declares one stdio server, and the name of that server is y-review. The name
 * matters, because a channel event carries the server name to the model.
 *
 * The document has two shapes. OpenCode names the object mcp, and it holds the program and
 * its arguments in one array. Every other agent names the object mcpServers, and it holds
 * the program apart from its arguments.
 *
 * The file stands at a path that outlives the session, and [ConfigFile] holds that path
 * and the rule of the write.
 *
 * The file holds no secret. The session hands the bridge address and the bridge token to
 * the server through the environment, and never through this file or a command line.
 */
object ChannelConfig {

    private const val TEMPORARY_SUFFIX = ".tmp"

    private const val STDIO = "stdio"

    /** The word OpenCode reads for a server that runs on this machine. */
    private const val LOCAL = "local"

    private val JSON = Json { prettyPrint = true }

    @Serializable
    private data class Entry(val type: String, val command: String, val args: List<String>)

    @Serializable
    private data class Document(val mcpServers: Map<String, Entry>)

    @Serializable
    private data class LocalEntry(val type: String, val command: List<String>, val enabled: Boolean)

    @Serializable
    private data class LocalDocument(val mcp: Map<String, LocalEntry>)

    /**
     * [javaPath] is the launcher of the Java runtime that the IDE runs, and not the bare
     * command. An agent starts the server with a PATH of its own, so a full path always
     * runs. The class path holds one jar, and that jar holds every class of the server.
     */
    fun text(id: AgentId, javaPath: String, serverPath: String): String {
        val args = listOf(ChannelServer.CLASS_PATH_FLAG, serverPath, ChannelServer.MAIN_CLASS)
        return when (id) {
            AgentId.OPENCODE -> JSON.encodeToString(
                LocalDocument(mapOf(AgentLaunch.SERVER_NAME to LocalEntry(LOCAL, listOf(javaPath) + args, true)))
            )
            else -> JSON.encodeToString(
                Document(mapOf(AgentLaunch.SERVER_NAME to Entry(STDIO, javaPath, args)))
            )
        }
    }

    /**
     * Puts the file of [id] in place, and answers the path of it.
     *
     * A file that already holds this text stays as it is, so a start that changes nothing
     * writes nothing. The session never removes the file.
     */
    fun write(
        id: AgentId,
        javaPath: String,
        serverPath: String,
        home: Path = BridgeDiscovery.homeDirectory(),
    ): Path {
        val target = ConfigFile.path(home, id)
        val wanted = text(id, javaPath, serverPath)
        if (!ConfigFile.needsWrite(onDisk(target), wanted)) return target
        Files.createDirectories(target.parent)
        val temporary = Files.createTempFile(target.parent, ConfigFile.fileName(id), TEMPORARY_SUFFIX)
        Files.writeString(temporary, wanted)
        move(temporary, target)
        return target
    }

    /** Null when no file stands there, and null when a read of it fails. */
    private fun onDisk(target: Path): String? =
        if (target.isRegularFile()) runCatching { target.readText() }.getOrNull() else null

    /**
     * The same move that [com.yeskiy.yreview.bridge.DiscoveryFile] makes. An agent that
     * reads the file while the plugin writes it never sees half a document.
     */
    private fun move(temporary: Path, target: Path) {
        try {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (unsupported: IOException) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING)
        }
    }
}
