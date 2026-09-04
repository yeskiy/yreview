package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SendRoutesTest {

    @Test
    fun `a switch that is off beats every count`() {
        assertEquals(SendRoute.CHANNEL_OFF, SendRoutes.of(channel = false, receivers = 3, gitRepository = true))
        assertEquals(SendRoute.CHANNEL_OFF, SendRoutes.of(channel = false, receivers = 0, gitRepository = true))
    }

    @Test
    fun `a folder that no git repository holds beats every count`() {
        assertEquals(SendRoute.NO_REPOSITORY, SendRoutes.of(channel = true, receivers = 3, gitRepository = false))
        assertEquals(SendRoute.NO_REPOSITORY, SendRoutes.of(channel = false, receivers = 0, gitRepository = false))
    }

    @Test
    fun `one receiver is enough for the channel route`() {
        assertEquals(SendRoute.CHANNEL, SendRoutes.of(channel = true, receivers = 1, gitRepository = true))
    }

    @Test
    fun `no receiver falls to the clipboard`() {
        assertEquals(SendRoute.NO_SESSION, SendRoutes.of(channel = true, receivers = 0, gitRepository = true))
    }

    @Test
    fun `one opencode session and no event stream still takes the channel route`() {
        // An OpenCode session opens no event stream. It answers a loopback port instead.
        // Without this case the push into an OpenCode session never runs, and no other
        // test would show it.
        val reachable = 1

        assertEquals(
            SendRoute.CHANNEL,
            SendRoutes.of(channel = true, receivers = reachable, gitRepository = true),
        )
    }

    @Test
    fun `a stream that takes no push counts as no receiver`() {
        // Codex can hold a channel server for the review tools and still ignore a push.
        // A session that the plugin did not start holds no channel at all. Neither one
        // reaches the count, so the send falls to the clipboard.
        val reachable = 0

        assertEquals(
            SendRoute.NO_SESSION,
            SendRoutes.of(channel = true, receivers = reachable, gitRepository = true),
        )
    }

    @Test
    fun `only the channel route hides the reason`() {
        assertNull(SendRoute.CHANNEL.clipboardReason)
        assertEquals("No Claude Code session reads this project", SendRoute.NO_SESSION.clipboardReason)
        assertEquals("The review channel is off in the settings", SendRoute.CHANNEL_OFF.clipboardReason)
        assertEquals(
            "The review channel carries the tasks of a git repository only",
            SendRoute.NO_REPOSITORY.clipboardReason,
        )
    }
}
