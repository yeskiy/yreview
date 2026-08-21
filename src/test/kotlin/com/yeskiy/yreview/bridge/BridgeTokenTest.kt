package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertEquals

class BridgeTokenTest {

    @Test
    fun `makes a token the channel accepts`() {
        val token = BridgeToken.newToken()
        assertEquals(64, token.length)
        assertTrue(token.all { it in "0123456789abcdef" }, "the token must be lowercase hexadecimal")
    }

    @Test
    fun `makes a new token on every call`() {
        assertTrue(BridgeToken.newToken() != BridgeToken.newToken())
    }

    @Test
    fun `accepts the token it made`() {
        val token = BridgeToken.newToken()
        assertTrue(BridgeToken.matches(token, token))
    }

    @Test
    fun `refuses another token of the same length`() {
        assertFalse(BridgeToken.matches(BridgeToken.newToken(), BridgeToken.newToken()))
    }

    @Test
    fun `refuses a token that is missing`() {
        assertFalse(BridgeToken.matches(BridgeToken.newToken(), null))
    }

    @Test
    fun `refuses a token that is only a prefix`() {
        val token = BridgeToken.newToken()
        assertFalse(BridgeToken.matches(token, token.take(32)))
    }

    @Test
    fun `refuses an empty token`() {
        assertFalse(BridgeToken.matches(BridgeToken.newToken(), ""))
    }
}
