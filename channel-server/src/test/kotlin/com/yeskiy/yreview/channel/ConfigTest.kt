package com.yeskiy.yreview.channel

import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The server reads the bridge from a file, and never from a variable.
 *
 * The platform writes the environment of a terminal into the log of the IDE. A variable
 * that held the token would put the token in a log that a user attaches to a public
 * report, so only the path of the file travels there.
 */
class ConfigTest {

    private val token = "a-token-of-32-characters-000000000"

    private val sessionKey = "aaaaaaaaaaaaaaaa"

    private val home = Files.createTempDirectory("y-review-config")

    @AfterTest
    fun tearDown() {
        home.toFile().deleteRecursively()
    }

    /** Writes one bridge file, and answers the environment that names it. */
    private fun envWith(url: String, token: String? = this.token): Map<String, String?> = fileWith(
        listOfNotNull("\"url\":\"$url\"", token?.let { "\"token\":\"$it\"" }, "\"pid\":42")
            .joinToString(",", prefix = "{", postfix = "}")
    )

    private fun fileWith(text: String): Map<String, String?> = mapOf(
        Config.FILE_VARIABLE to
            Files.writeString(Files.createTempFile(home, "bridge", ".json"), text).toString()
    )

    private fun messageOf(environment: Map<String, String?>): String =
        assertFailsWith<ConfigError> { Config.parse(environment) }.message.orEmpty()

    private fun refuse(environment: Map<String, String?>, holds: String) {
        val message = messageOf(environment)
        assertTrue(message.contains(holds), message)
    }

    @Test
    fun `accepts a bridge on the IPv4 loopback address`() {
        assertEquals("http://127.0.0.1:64343", Config.parse(envWith("http://127.0.0.1:64343")).bridgeUrl)
    }

    @Test
    fun `accepts any address inside the loopback range`() {
        assertEquals("http://127.2.3.4:64343", Config.parse(envWith("http://127.2.3.4:64343")).bridgeUrl)
    }

    @Test
    fun `accepts the name localhost`() {
        assertEquals("http://localhost:64343", Config.parse(envWith("http://localhost:64343")).bridgeUrl)
    }

    @Test
    fun `accepts the IPv6 loopback address`() {
        assertEquals("http://[::1]:64343", Config.parse(envWith("http://[::1]:64343")).bridgeUrl)
    }

    @Test
    fun `keeps a base path and removes the trailing slash`() {
        assertEquals(
            "http://127.0.0.1:64343/y-review",
            Config.parse(envWith("http://127.0.0.1:64343/y-review/")).bridgeUrl,
        )
    }

    @Test
    fun `reads the token from the file that the variable names`() {
        assertEquals(token, Config.parse(envWith("http://127.0.0.1:64343")).token)
    }

    @Test
    fun `keeps every value of the file out of the environment`() {
        val environment = envWith("http://127.0.0.1:64343")

        assertEquals(listOf(Config.FILE_VARIABLE), environment.keys.toList())
        assertFalse(environment.getValue(Config.FILE_VARIABLE).orEmpty().contains(token))
    }

    @Test
    fun `rejects an address outside the loopback range`() {
        refuse(envWith("http://192.168.1.5:64343"), "loopback")
    }

    @Test
    fun `rejects a host name that is not localhost`() {
        refuse(envWith("http://example.com"), "loopback")
    }

    @Test
    fun `rejects a scheme other than http`() {
        refuse(envWith("https://127.0.0.1:64343"), "http")
    }

    @Test
    fun `rejects a file address`() {
        refuse(envWith("file:///etc/passwd"), "http")
    }

    @Test
    fun `rejects an address that does not parse`() {
        refuse(envWith("not a url"), Config.FILE_VARIABLE)
    }

    @Test
    fun `rejects a file that names no address`() {
        refuse(fileWith("{\"token\":\"$token\"}"), Config.FILE_VARIABLE)
    }

    @Test
    fun `rejects a file that holds no token`() {
        refuse(envWith("http://127.0.0.1:64343", token = null), "token")
    }

    @Test
    fun `rejects a token that is too short to guard the bridge`() {
        refuse(envWith("http://127.0.0.1:64343", token = "short"), "token")
    }

    @Test
    fun `rejects an environment that names no file`() {
        refuse(emptyMap(), Config.FILE_VARIABLE)
    }

    @Test
    fun `rejects a name that is blank`() {
        refuse(mapOf(Config.FILE_VARIABLE to "   "), Config.FILE_VARIABLE)
    }

    @Test
    fun `rejects a file that is not there`() {
        refuse(mapOf(Config.FILE_VARIABLE to home.resolve("no-such-bridge.json").toString()), Config.FILE_VARIABLE)
    }

    @Test
    fun `rejects a file that holds no valid JSON`() {
        refuse(fileWith("not json"), "JSON")
    }

    @Test
    fun `rejects a file that is too large to hold a bridge`() {
        refuse(fileWith("x".repeat((Config.MAX_FILE_BYTES + 1).toInt())), "large")
    }

    @Test
    fun `a refusal never repeats the token`() {
        listOf(
            envWith("https://127.0.0.1:64343"),
            envWith("http://10.0.0.5:64343"),
            envWith("http://127.0.0.1:64343", token = token.take(8)),
        ).forEach { environment ->
            val message = messageOf(environment)

            assertTrue(message.isNotEmpty())
            assertFalse(message.contains(token.take(8)), "a refusal must repeat no part of the token")
        }
    }

    @Test
    fun `reads the session key when the environment carries one`() {
        val parsed = Config.parse(envWith("http://127.0.0.1:64343") + (Config.KEY_VARIABLE to sessionKey))

        assertEquals(sessionKey, parsed.sessionKey)
    }

    @Test
    fun `starts without a session key`() {
        // An agent that runs one session at a time reaches no chooser, so it needs no key.
        assertNull(Config.parse(envWith("http://127.0.0.1:64343")).sessionKey)
    }

    @Test
    fun `drops a session key that is blank`() {
        assertNull(Config.parse(envWith("http://127.0.0.1:64343") + (Config.KEY_VARIABLE to "   ")).sessionKey)
    }

    @Test
    fun `carries the same variable names as the plugin`() {
        assertEquals("Y_REVIEW_BRIDGE_FILE", Config.FILE_VARIABLE)
        assertEquals("Y_REVIEW_SESSION_KEY", Config.KEY_VARIABLE)
    }
}
