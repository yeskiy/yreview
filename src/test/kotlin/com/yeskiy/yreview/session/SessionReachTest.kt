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

    @Test
    fun `claude code is reached through the channel`() {
        assertEquals(SessionReach.Channel, SessionReach.of(AgentCatalog.of(AgentId.CLAUDE), null, null))
    }

    @Test
    fun `opencode is reached on its own loopback port`() {
        assertEquals(
            SessionReach.LocalHttp(47821, "s3cret"),
            SessionReach.of(AgentCatalog.of(AgentId.OPENCODE), 47821, "s3cret"),
        )
    }

    @Test
    fun `opencode without a port or a password is reached by nothing`() {
        // Both come from the plugin. With either one missing there is nothing to post to.
        val opencode = AgentCatalog.of(AgentId.OPENCODE)

        assertEquals(SessionReach.None, SessionReach.of(opencode, null, null))
        assertEquals(SessionReach.None, SessionReach.of(opencode, 47821, null))
        assertEquals(SessionReach.None, SessionReach.of(opencode, null, "s3cret"))
    }

    @Test
    fun `an agent that takes no push is reached by nothing`() {
        // A channel server may still run for the tools, so an open stream must not decide.
        assertEquals(SessionReach.None, SessionReach.of(AgentCatalog.of(AgentId.CODEX), null, null))
        assertEquals(SessionReach.None, SessionReach.of(AgentCatalog.of(AgentId.GEMINI), null, null))
        assertEquals(SessionReach.None, SessionReach.of(AgentCatalog.of(AgentId.CUSTOM), null, null))
        assertEquals(SessionReach.None, SessionReach.of(AgentCatalog.of(AgentId.NONE), null, null))
    }

    @Test
    fun `a reach built from an agent never prints the password`() {
        // The reach reaches a log through the session record and the diagnostic report.
        val reach = SessionReach.of(AgentCatalog.of(AgentId.OPENCODE), 47821, "the-secret-value")

        assertFalse(reach.toString().contains("the-secret-value"), reach.toString())
    }
}
