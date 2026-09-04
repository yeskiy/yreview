package com.yeskiy.yreview.bridge

import java.security.SecureRandom
import java.util.HexFormat

/**
 * The address of one review session on the bridge.
 *
 * The key says which session a stream belongs to. It never says whether that session may
 * connect, because the bridge token alone decides that. A process that reads the discovery
 * file already holds the token, so the key guards nothing and needs no guard of its own.
 *
 * The plugin makes one key for each session and hands it to that session in the
 * environment. The channel server of the session sends the key back in a header on every
 * request, and the bridge then knows which stream belongs to which tab.
 */
object SessionKey {

    /** The environment variable that carries the key to a session. */
    const val VARIABLE = "Y_REVIEW_SESSION_KEY"

    /** The request header that carries the key back to the bridge. */
    const val HEADER = "X-Y-Review-Session"

    const val KEY_BYTES = 8

    const val MIN_LENGTH = 8

    const val MAX_LENGTH = 64

    private val ALLOWED = Regex("^[A-Za-z0-9-]+$")

    private val random = SecureRandom()

    fun newKey(): String {
        val bytes = ByteArray(KEY_BYTES)
        random.nextBytes(bytes)
        return HexFormat.of().formatHex(bytes)
    }

    /**
     * Answers whether the value can name a session.
     *
     * A request writes this header, so the bridge never trusts the value. The check bounds
     * the length and allows letters, digits, and the hyphen only. A value of any other
     * shape names no session, so it can never reach a comparison or a log line.
     */
    fun isValid(value: String?): Boolean {
        if (value == null || value.length < MIN_LENGTH || value.length > MAX_LENGTH) return false
        return ALLOWED.matches(value)
    }
}
