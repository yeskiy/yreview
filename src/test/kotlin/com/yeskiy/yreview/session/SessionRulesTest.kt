package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.BridgeServer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionRulesTest {

    @Test
    fun `the first tab takes the number one`() {
        assertEquals(1, SessionRules.freeNumber(emptySet()))
    }

    @Test
    fun `a new tab takes the smallest number that no open tab holds`() {
        assertEquals(2, SessionRules.freeNumber(setOf(1, 3)))
        assertEquals(4, SessionRules.freeNumber(setOf(1, 2, 3)))
        assertEquals(1, SessionRules.freeNumber(setOf(2, 3)))
    }

    @Test
    fun `the stable name carries no state`() {
        // The picker of the review window shows this name, and it must not change with the state.
        assertEquals("Claude 2", SessionRules.name(2))
    }

    @Test
    fun `a running session shows the number alone`() {
        assertEquals("Claude 1", SessionRules.label(1, SessionState.RUNNING))
    }

    @Test
    fun `every other state stands beside the number`() {
        assertEquals("Claude 2 (not started)", SessionRules.label(2, SessionState.NOT_STARTED))
        assertEquals("Claude 2 (starting)", SessionRules.label(2, SessionState.STARTING))
        assertEquals("Claude 2 (ended)", SessionRules.label(2, SessionState.ENDED))
    }

    @Test
    fun `the window opens no tab over the stream limit of the bridge`() {
        assertEquals(BridgeServer.MAX_STREAMS, SessionRules.MAX_SESSIONS)
        assertTrue(SessionRules.canOpen(0))
        assertTrue(SessionRules.canOpen(SessionRules.MAX_SESSIONS - 1))
        assertFalse(SessionRules.canOpen(SessionRules.MAX_SESSIONS))
        assertFalse(SessionRules.canOpen(SessionRules.MAX_SESSIONS + 1))
    }

    @Test
    fun `the sixteenth tab opens and the seventeenth does not`() {
        // The bridge serves 16 event streams, so the sixteenth tab is the last one.
        assertTrue(SessionRules.canOpen(15))
        assertEquals(16, SessionRules.freeNumber((1..15).toSet()))
        assertFalse(SessionRules.canOpen(16))
    }

    @Test
    fun `every label starts with the stable name of the tab`() {
        SessionState.entries.forEach {
            assertTrue(SessionRules.label(3, it).startsWith(SessionRules.name(3)), it.name)
        }
    }
}
