package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.DiscoveryFile
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.isRegularFile
import kotlin.io.path.readText

sealed interface BridgeLookup {

    /** The address of the bridge, and the file that holds that address and the token. */
    data class Available(val url: String, val path: String) : BridgeLookup

    /** The bridge is not there, and the reason says what the lookup found instead. */
    data class Unavailable(val reason: String) : BridgeLookup

    /**
     * The user turned the channel off in the settings. The plugin opens no port then, so
     * the session must never read the file of an earlier run.
     */
    data object ChannelOff : BridgeLookup
}

/**
 * Reads the file that the plugin bridge writes when it starts.
 *
 * The file holds a bearer token. The token stays inside this object, and a caller reads
 * the path of the file instead. A session opens that path and takes the token from it, so
 * the token reaches no log, no command line and no variable.
 */
object BridgeDiscovery {

    /** The variable that carries the path of the bridge file to one session. */
    const val FILE_VARIABLE = "Y_REVIEW_BRIDGE_FILE"

    const val MINIMUM_TOKEN_LENGTH = 16

    private val LOOPBACK_NAMES = setOf("localhost", "::1", "[::1]")
    private val JSON = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class BridgeFile(val url: String? = null, val token: String? = null)

    /** The writer states the rule for the name, and the reader follows it. */
    fun fileFor(home: Path, projectPath: String): Path =
        home.resolve(".y-review").resolve("bridge").resolve(DiscoveryFile.fileName(projectPath))

    fun homeDirectory(): Path =
        Paths.get(System.getenv("USERPROFILE") ?: System.getProperty("user.home"))

    fun find(projectPath: String): BridgeLookup = find(homeDirectory(), projectPath)

    fun find(home: Path, projectPath: String): BridgeLookup {
        val file = fileFor(home, projectPath)
        if (!file.isRegularFile()) {
            return BridgeLookup.Unavailable("The bridge server did not write a file for this project.")
        }
        return runCatching { parse(file.readText(), file.toString()) }
            .getOrElse { BridgeLookup.Unavailable("The bridge file cannot be read.") }
    }

    /**
     * Answers what the text of one bridge file holds.
     *
     * The token never leaves this function. The check proves that the file names a live
     * bridge, and the answer then carries the address and [path] alone.
     */
    private fun parse(text: String, path: String): BridgeLookup {
        val file = runCatching { JSON.decodeFromString<BridgeFile>(text) }.getOrNull()
            ?: return BridgeLookup.Unavailable("The bridge file does not hold valid JSON.")
        val token = file.token
        if (token == null || token.length < MINIMUM_TOKEN_LENGTH) {
            return BridgeLookup.Unavailable("The bridge file holds a token that is too short.")
        }
        val url = checkUrl(file.url) ?: return BridgeLookup.Unavailable(
            "The bridge file holds an address that is not a loopback http address."
        )
        return BridgeLookup.Available(url, path)
    }

    private fun checkUrl(raw: String?): String? {
        if (raw == null) return null
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        if (uri.scheme != "http") return null
        val host = uri.host ?: return null
        if (host.lowercase() !in LOOPBACK_NAMES && !host.startsWith("127.")) return null
        return raw.trimEnd('/')
    }
}
