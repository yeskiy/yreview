package com.yeskiy.ideareview.session

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.isRegularFile
import kotlin.io.path.readText

sealed interface BridgeLookup {

    data class Available(val url: String, val token: String) : BridgeLookup

    data class Unavailable(val reason: String) : BridgeLookup
}

/**
 * Reads the file that the plugin bridge writes when it starts. The file holds a bearer
 * token, so nothing here ever writes the token to a log or to a command line.
 */
object BridgeDiscovery {

    const val URL_VARIABLE = "IDEA_REVIEW_BRIDGE_URL"
    const val TOKEN_VARIABLE = "IDEA_REVIEW_BRIDGE_TOKEN"
    const val MINIMUM_TOKEN_LENGTH = 16

    private val NOT_ALPHANUMERIC = Regex("[^A-Za-z0-9]")
    private val LOOPBACK_NAMES = setOf("localhost", "::1", "[::1]")
    private val JSON = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class BridgeFile(val url: String? = null, val token: String? = null)

    fun fileName(projectPath: String): String =
        NOT_ALPHANUMERIC.replace(projectPath.replace('\\', '/'), "-") + ".json"

    fun fileFor(home: Path, projectPath: String): Path =
        home.resolve(".idea-review").resolve("bridge").resolve(fileName(projectPath))

    fun homeDirectory(): Path =
        Paths.get(System.getenv("USERPROFILE") ?: System.getProperty("user.home"))

    fun find(projectPath: String): BridgeLookup = find(homeDirectory(), projectPath)

    fun find(home: Path, projectPath: String): BridgeLookup {
        val file = fileFor(home, projectPath)
        if (!file.isRegularFile()) {
            return BridgeLookup.Unavailable("The bridge server did not write a file for this project.")
        }
        return runCatching { parse(file.readText()) }
            .getOrElse { BridgeLookup.Unavailable("The bridge file cannot be read.") }
    }

    fun parse(text: String): BridgeLookup {
        val file = runCatching { JSON.decodeFromString<BridgeFile>(text) }.getOrNull()
            ?: return BridgeLookup.Unavailable("The bridge file does not hold valid JSON.")
        val token = file.token
        if (token == null || token.length < MINIMUM_TOKEN_LENGTH) {
            return BridgeLookup.Unavailable("The bridge file holds a token that is too short.")
        }
        val url = checkUrl(file.url) ?: return BridgeLookup.Unavailable(
            "The bridge file holds an address that is not a loopback http address."
        )
        return BridgeLookup.Available(url, token)
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
