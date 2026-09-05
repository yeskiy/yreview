package com.yeskiy.yreview.bridge

import java.security.MessageDigest
import java.security.SecureRandom
import java.nio.charset.StandardCharsets

/**
 * The bearer secret of the bridge. The plugin makes a new token every time the server
 * starts, keeps it in memory and in the discovery file, and never writes it to a log or
 * to a command line.
 */
object BridgeToken {

    private const val TOKEN_BYTES = 32

    private val random = SecureRandom()

    fun newToken(): String {
        val bytes = ByteArray(TOKEN_BYTES)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * Compares the two values in constant time. The check runs over the digests, so the
     * time it takes tells a caller nothing about the token or about its length.
     *
     * An empty value is no token, and it matches nothing. A server that holds no token
     * would otherwise accept a caller that sends no token.
     */
    fun matches(expected: String, given: String?): Boolean {
        if (expected.isEmpty() || given.isNullOrEmpty()) return false
        return MessageDigest.isEqual(digestOf(expected), digestOf(given))
    }

    private fun digestOf(value: String): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
}
