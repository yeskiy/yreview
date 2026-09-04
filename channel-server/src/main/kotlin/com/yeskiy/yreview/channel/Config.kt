package com.yeskiy.yreview.channel

import java.net.URI

/**
 * The bridge address, the secret that reaches it, and the address of this session.
 *
 * The first two are required. The session key is optional, because a session that started
 * before the key existed must still read the bridge.
 */
data class BridgeConfig(val bridgeUrl: String, val token: String, val sessionKey: String? = null)

/** A configuration value that the server refuses. The text reaches the standard error. */
class ConfigError(message: String) : Exception(message)

/**
 * Reads the variables of one review session.
 *
 * The address must point at the loopback interface over plain http. The bridge listens
 * there and nowhere else, so any other address is a mistake or an attack.
 */
object Config {

    const val URL_VARIABLE = "Y_REVIEW_BRIDGE_URL"

    const val TOKEN_VARIABLE = "Y_REVIEW_BRIDGE_TOKEN"

    /** The address of this session. The plugin writes it, and an older session has none. */
    const val KEY_VARIABLE = "Y_REVIEW_SESSION_KEY"

    const val MIN_TOKEN_LENGTH = 16

    private val LOOPBACK_NAMES = setOf("localhost", "[::1]", "::1")

    private val IPV4 = Regex("""^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$""")

    private val TRAILING_SLASHES = Regex("/+$")

    fun parse(environment: Map<String, String?>): BridgeConfig = BridgeConfig(
        bridgeUrl = checkUrl(environment[URL_VARIABLE].orEmpty()),
        token = checkToken(environment[TOKEN_VARIABLE]),
        sessionKey = environment[KEY_VARIABLE]?.takeIf { it.isNotBlank() },
    )

    private fun isLoopback(hostname: String): Boolean =
        LOOPBACK_NAMES.contains(hostname.lowercase()) || IPV4.find(hostname)?.groupValues?.get(1) == "127"

    private fun notAnAddress(raw: String): Nothing = throw ConfigError("$URL_VARIABLE is not an address: $raw")

    private fun checkUrl(raw: String): String {
        val uri = runCatching { URI(raw) }.getOrNull() ?: notAnAddress(raw)
        val scheme = uri.scheme ?: notAnAddress(raw)
        if (scheme != "http") throw ConfigError("$URL_VARIABLE must use http, not $scheme")
        val host = uri.host ?: notAnAddress(raw)
        if (!isLoopback(host)) throw ConfigError("$URL_VARIABLE must point at the loopback address, not $host")
        val port = if (uri.port < 0) "" else ":${uri.port}"
        return "http://$host$port" + TRAILING_SLASHES.replace(uri.path.orEmpty(), "")
    }

    private fun checkToken(raw: String?): String {
        if (raw == null || raw.length < MIN_TOKEN_LENGTH) {
            throw ConfigError("$TOKEN_VARIABLE must hold at least $MIN_TOKEN_LENGTH characters")
        }
        return raw
    }
}
