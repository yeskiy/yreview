package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class SessionKeyTest {

    @Test
    fun `a key holds hexadecimal characters only`() {
        val key = SessionKey.newKey()

        assertEquals(SessionKey.KEY_BYTES * 2, key.length)
        assertTrue(key.all { it in "0123456789abcdef" }, key)
    }

    @Test
    fun `two keys differ`() {
        assertNotEquals(SessionKey.newKey(), SessionKey.newKey())
    }

    @Test
    fun `a fresh key passes the check`() {
        assertTrue(SessionKey.isValid(SessionKey.newKey()))
    }

    @Test
    fun `the check refuses a value that no session could have made`() {
        assertFalse(SessionKey.isValid(null))
        assertFalse(SessionKey.isValid(""))
        assertFalse(SessionKey.isValid("short"))
        assertFalse(SessionKey.isValid("a".repeat(SessionKey.MAX_LENGTH + 1)))
        assertFalse(SessionKey.isValid("has a space here"))
        assertFalse(SessionKey.isValid("holds\na line break"))
    }

    @Test
    fun `the check refuses a value that could break a log line`() {
        assertFalse(SessionKey.isValid("carriage\rreturn0"))
        assertFalse(SessionKey.isValid("a-tab\tinside00"))
    }

    @Test
    fun `the two names of the contract stay as they are`() {
        // The channel server holds its own copy of both names, and no compiler ties them.
        assertEquals("Y_REVIEW_SESSION_KEY", SessionKey.VARIABLE)
        assertEquals("X-Y-Review-Session", SessionKey.HEADER)
    }
}
