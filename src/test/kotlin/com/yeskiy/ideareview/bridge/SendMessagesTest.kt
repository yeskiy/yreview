package com.yeskiy.ideareview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SendMessagesTest {

    @Test
    fun `names the comments and the sessions`() {
        val notice = SendMessages.of(SendReport(comments = 3, batches = 1, streams = 2))
        assertEquals("The IDE sent 3 comments to 2 sessions.", notice.text)
        assertFalse(notice.warning)
    }

    @Test
    fun `names one comment and one session in the singular`() {
        assertEquals(
            "The IDE sent 1 comment to 1 session.",
            SendMessages.of(SendReport(comments = 1, batches = 1, streams = 1)).text,
        )
    }

    @Test
    fun `warns when no session reads the bridge`() {
        val notice = SendMessages.of(SendReport(comments = 2, batches = 1, streams = 0))
        assertTrue(notice.warning)
        assertTrue(notice.text.contains("No Claude Code session reads this project."), notice.text)
    }

    @Test
    fun `says that the repository holds no open comment`() {
        val notice = SendMessages.of(SendReport(comments = 0, batches = 0, streams = 1))
        assertEquals("This repository has no open review comment.", notice.text)
        assertFalse(notice.warning)
    }

    @Test
    fun `gives the problem back`() {
        val notice = SendMessages.of(SendReport(0, 0, 0, "The repository app has no commit yet."))
        assertEquals("The repository app has no commit yet.", notice.text)
        assertTrue(notice.warning)
    }

    @Test
    fun `reports the problem before the empty repository`() {
        val notice = SendMessages.of(SendReport(0, 0, 0, "The review bridge is not running."))
        assertTrue(notice.warning)
        assertEquals("The review bridge is not running.", notice.text)
    }
}
