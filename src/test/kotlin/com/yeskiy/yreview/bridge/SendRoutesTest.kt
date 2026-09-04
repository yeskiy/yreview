package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SendRoutesTest {

    @Test
    fun `the closed switch beats a reader`() {
        assertEquals(SendRoute.CHANNEL_OFF, SendRoutes.of(channel = false, readers = 3, gitRepository = true))
        assertEquals(SendRoute.CHANNEL_OFF, SendRoutes.of(channel = false, readers = 0, gitRepository = true))
    }

    @Test
    fun `the open switch reaches the channel while a session reads`() {
        assertEquals(SendRoute.CHANNEL, SendRoutes.of(channel = true, readers = 1, gitRepository = true))
    }

    @Test
    fun `the open switch without a reader goes to the clipboard`() {
        assertEquals(SendRoute.NO_SESSION, SendRoutes.of(channel = true, readers = 0, gitRepository = true))
    }

    @Test
    fun `a folder store never reaches the channel`() {
        assertEquals(SendRoute.NO_REPOSITORY, SendRoutes.of(channel = true, readers = 3, gitRepository = false))
        assertEquals(SendRoute.NO_REPOSITORY, SendRoutes.of(channel = false, readers = 0, gitRepository = false))
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
