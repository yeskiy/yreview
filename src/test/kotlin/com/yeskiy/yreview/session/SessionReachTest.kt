package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionReachTest {

    @Test
    fun `a channel session takes a send only while its stream is open`() {
        assertTrue(SessionReach.Channel.takesSend(streamOpen = true))
        assertFalse(SessionReach.Channel.takesSend(streamOpen = false))
    }

    @Test
    fun `a session with a port of its own takes a send with no stream`() {
        // An agent that reads a loopback port opens no event stream, and a send still
        // arrives. A stream alone therefore cannot decide who takes a send.
        val reach = SessionReach.LocalHttp(47821, "s3cret")

        assertTrue(reach.takesSend(streamOpen = false))
        assertTrue(reach.takesSend(streamOpen = true))
    }

    @Test
    fun `a session that takes no send is never a target`() {
        // An agent can register the tool server, and so open a stream, and still ignore
        // every message pushed into it.
        assertFalse(SessionReach.None.takesSend(streamOpen = true))
        assertFalse(SessionReach.None.takesSend(streamOpen = false))
    }

    @Test
    fun `the password never reaches a log`() {
        assertEquals("LocalHttp(port=47821)", SessionReach.LocalHttp(47821, "the-secret-value").toString())
    }
}
