package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SendRoutesTest {

    @Test
    fun `the closed switch beats a reader`() {
        assertEquals(SendRoute.CHANNEL_OFF, SendRoutes.of(channel = false, readers = 3))
        assertEquals(SendRoute.CHANNEL_OFF, SendRoutes.of(channel = false, readers = 0))
    }

    @Test
    fun `the open switch reaches the channel while a session reads`() {
        assertEquals(SendRoute.CHANNEL, SendRoutes.of(channel = true, readers = 1))
    }

    @Test
    fun `the open switch without a reader goes to the clipboard`() {
        assertEquals(SendRoute.NO_SESSION, SendRoutes.of(channel = true, readers = 0))
    }

    @Test
    fun `only the channel route hides the reason`() {
        assertNull(SendRoute.CHANNEL.clipboardReason)
        assertEquals("No Claude Code session reads this project", SendRoute.NO_SESSION.clipboardReason)
        assertEquals("The review channel is off in the settings", SendRoute.CHANNEL_OFF.clipboardReason)
    }
}
