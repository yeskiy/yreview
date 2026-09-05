package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PortRetryTest {

    @Test
    fun `a session that died at once on a loopback port starts again`() {
        // The measured run: OpenCode lost the port and exited after 891 milliseconds.
        assertTrue(PortRetry.again(PushKind.LOCAL_HTTP, 891L, 1))
    }

    @Test
    fun `an agent that runs no server of its own never starts again`() {
        // Only a loopback port can be taken by another process, so no other agent retries.
        assertFalse(PortRetry.again(PushKind.CHANNEL, 891L, 1))
        assertFalse(PortRetry.again(PushKind.NONE, 891L, 1))
    }

    @Test
    fun `a session that ran and then ended stays ended`() {
        assertFalse(PortRetry.again(PushKind.LOCAL_HTTP, 60_000L, 1))
    }

    @Test
    fun `the limit itself is already too long`() {
        assertTrue(PortRetry.again(PushKind.LOCAL_HTTP, PortRetry.SHORT_MILLIS - 1, 1))
        assertFalse(PortRetry.again(PushKind.LOCAL_HTTP, PortRetry.SHORT_MILLIS, 1))
        assertFalse(PortRetry.again(PushKind.LOCAL_HTTP, PortRetry.SHORT_MILLIS + 1, 1))
    }

    @Test
    fun `the count at the cap stops the chain`() {
        assertTrue(PortRetry.again(PushKind.LOCAL_HTTP, 891L, PortRetry.MAX_TRIES - 1))
        assertFalse(PortRetry.again(PushKind.LOCAL_HTTP, 891L, PortRetry.MAX_TRIES))
        assertFalse(PortRetry.again(PushKind.LOCAL_HTTP, 891L, PortRetry.MAX_TRIES + 1))
    }

    @Test
    fun `one press on Start makes five starts and no more`() {
        assertEquals(5, PortRetry.MAX_TRIES)
        val answers = (1..6).map { PortRetry.again(PushKind.LOCAL_HTTP, 891L, it) }

        assertEquals(listOf(true, true, true, true, false, false), answers)
    }
}
