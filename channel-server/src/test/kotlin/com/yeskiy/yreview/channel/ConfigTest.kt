package com.yeskiy.yreview.channel

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ConfigTest {

    private val token = "a-token-of-32-characters-000000000"

    private fun envWith(url: String): Map<String, String?> =
        mapOf(Config.URL_VARIABLE to url, Config.TOKEN_VARIABLE to token)

    private fun refuse(environment: Map<String, String?>, holds: String) {
        val message = assertFailsWith<ConfigError> { Config.parse(environment) }.message.orEmpty()
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
    fun `returns the token`() {
        assertEquals(token, Config.parse(envWith("http://127.0.0.1:64343")).token)
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
        refuse(envWith("not a url"), Config.URL_VARIABLE)
    }

    @Test
    fun `rejects a missing address`() {
        refuse(mapOf(Config.TOKEN_VARIABLE to token), Config.URL_VARIABLE)
    }

    @Test
    fun `rejects a missing token`() {
        refuse(mapOf(Config.URL_VARIABLE to "http://127.0.0.1:64343"), Config.TOKEN_VARIABLE)
    }

    @Test
    fun `rejects a token that is too short to guard the bridge`() {
        refuse(
            mapOf(Config.URL_VARIABLE to "http://127.0.0.1:64343", Config.TOKEN_VARIABLE to "short"),
            Config.TOKEN_VARIABLE,
        )
    }
}
