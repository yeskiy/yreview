package com.yeskiy.yreview.channel

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path

/**
 * The bridge address, the secret that reaches it, and the address of this session.
 *
 * The first two are required. The session key is optional, because an agent that runs one
 * session at a time needs no key.
 */
data class BridgeConfig(val bridgeUrl: String, val token: String, val sessionKey: String? = null)

/** A configuration value that the server refuses. The text reaches the standard error. */
class ConfigError(message: String) : Exception(message)

/**
 * Reads the bridge of one review session.
 *
 * The environment names the file of the bridge, and the file holds the address and the
 * token. The token therefore never stands in a variable. The log of the IDE keeps the
 * environment of a terminal, and a path alone reaches that log.
 *
 * The address must point at the loopback interface over plain http. The bridge listens
 * there and nowhere else, so any other address is a mistake or an attack.
 */
object Config {

    /** The path of the file that the plugin writes when the bridge of a project starts. */
    const val FILE_VARIABLE = "Y_REVIEW_BRIDGE_FILE"

    /** The address of this session. The plugin writes it, and one session alone has none. */
    const val KEY_VARIABLE = "Y_REVIEW_SESSION_KEY"

    const val MIN_TOKEN_LENGTH = 16

    /** The largest bridge file the server reads. A real one holds a few hundred bytes. */
    const val MAX_FILE_BYTES = 65_536L

    private val LOOPBACK_NAMES = setOf("localhost", "[::1]", "::1")

    private val IPV4 = Regex("""^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$""")

    private val TRAILING_SLASHES = Regex("/+$")

    private val JSON = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class BridgeFile(val url: String? = null, val token: String? = null)

    fun parse(environment: Map<String, String?>): BridgeConfig {
        val file = read(environment[FILE_VARIABLE])
        return BridgeConfig(
            bridgeUrl = checkUrl(file.url.orEmpty()),
            token = checkToken(file.token),
            sessionKey = environment[KEY_VARIABLE]?.takeIf { it.isNotBlank() },
        )
    }

    /**
     * Reads the file that [FILE_VARIABLE] names.
     *
     * The name comes from the environment of this process, so the reader bounds what it
     * takes. A file over [MAX_FILE_BYTES] holds no bridge, and the server refuses it
     * before it reads the content.
     */
    private fun read(raw: String?): BridgeFile {
        if (raw.isNullOrBlank()) throw ConfigError("$FILE_VARIABLE must name the bridge file of the project")
        val path = runCatching { Path.of(raw) }.getOrNull()
            ?: throw ConfigError("$FILE_VARIABLE is not a path")
        if (!Files.isRegularFile(path)) throw ConfigError("$FILE_VARIABLE names no file")
        if (Files.size(path) > MAX_FILE_BYTES) {
            throw ConfigError("$FILE_VARIABLE names a file that is too large to hold a bridge")
        }
        val text = runCatching { Files.readString(path) }.getOrNull()
            ?: throw ConfigError("$FILE_VARIABLE names a file that this session cannot read")
        return runCatching { JSON.decodeFromString<BridgeFile>(text) }.getOrNull()
            ?: throw ConfigError("$FILE_VARIABLE names a file that holds no valid JSON")
    }

    private fun isLoopback(hostname: String): Boolean =
        LOOPBACK_NAMES.contains(hostname.lowercase()) || IPV4.find(hostname)?.groupValues?.get(1) == "127"

    private fun notAnAddress(raw: String): Nothing =
        throw ConfigError("the file of $FILE_VARIABLE holds no address: $raw")

    private fun checkUrl(raw: String): String {
        val uri = runCatching { URI(raw) }.getOrNull() ?: notAnAddress(raw)
        val scheme = uri.scheme ?: notAnAddress(raw)
        if (scheme != "http") throw ConfigError("the file of $FILE_VARIABLE must use http, not $scheme")
        val host = uri.host ?: notAnAddress(raw)
        if (!isLoopback(host)) {
            throw ConfigError("the file of $FILE_VARIABLE must point at the loopback address, not $host")
        }
        val port = if (uri.port < 0) "" else ":${uri.port}"
        return "http://$host$port" + TRAILING_SLASHES.replace(uri.path.orEmpty(), "")
    }

    /** The message names the length and never the value, so no log line can hold a token. */
    private fun checkToken(raw: String?): String {
        if (raw == null || raw.length < MIN_TOKEN_LENGTH) {
            throw ConfigError("the file of $FILE_VARIABLE must hold a token of $MIN_TOKEN_LENGTH characters or more")
        }
        return raw
    }
}
