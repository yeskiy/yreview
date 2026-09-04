package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SendMessagesTest {

    @Test
    fun `names the tasks and the sessions`() {
        val notice = SendMessages.of(SendReport(tasks = 3, batches = 1, streams = 2))
        assertEquals("The IDE sent 3 tasks to 2 sessions.", notice.text)
        assertFalse(notice.warning)
    }

    @Test
    fun `names one task and one session in the singular`() {
        assertEquals(
            "The IDE sent 1 task to 1 session.",
            SendMessages.of(SendReport(tasks = 1, batches = 1, streams = 1)).text,
        )
    }

    @Test
    fun `warns when no session reads the bridge`() {
        val notice = SendMessages.of(SendReport(tasks = 2, batches = 1, streams = 0))
        assertTrue(notice.warning)
        assertTrue(notice.text.contains("No Claude Code session reads this project."), notice.text)
    }

    @Test
    fun `says that the repository holds no open task`() {
        val notice = SendMessages.of(SendReport(tasks = 0, batches = 0, streams = 1))
        assertEquals("This repository has no open task.", notice.text)
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

    @Test
    fun `names the count and the reason of every dropped task`() {
        val notice = SendMessages.of(
            SendReport(
                tasks = 12,
                batches = 1,
                streams = 1,
                dropped = 2,
                dropReason = BatchBuilder.ID_REASON,
            )
        )
        assertEquals(
            "The IDE sent 12 tasks to 1 session. " +
                "2 tasks were dropped, because the identifier breaks the channel rule.",
            notice.text,
        )
        assertTrue(notice.warning, "a dropped task is a loss the user must see")
    }

    @Test
    fun `names one dropped task in the singular`() {
        val notice = SendMessages.of(
            SendReport(tasks = 1, batches = 1, streams = 1, dropped = 1, dropReason = BatchBuilder.TEXT_REASON)
        )
        assertTrue(notice.text.endsWith("1 task was dropped, because the task has no text."), notice.text)
    }

    @Test
    fun `names the missing session on the clipboard route`() {
        val notice = SendMessages.of(
            SendReport(tasks = 4, batches = 0, streams = 0, route = SendRoute.NO_SESSION, folder = ".git/y-review")
        )
        assertEquals(
            "No Claude Code session reads this project, so the IDE wrote 4 tasks to .git/y-review " +
                "and copied the prompt to the clipboard.",
            notice.text,
        )
        assertFalse(notice.warning)
    }

    @Test
    fun `names the closed switch on the clipboard route`() {
        val notice = SendMessages.of(
            SendReport(tasks = 4, batches = 0, streams = 0, route = SendRoute.CHANNEL_OFF, folder = ".git/y-review")
        )
        assertEquals(
            "The review channel is off in the settings, so the IDE wrote 4 tasks to .git/y-review " +
                "and copied the prompt to the clipboard.",
            notice.text,
        )
        assertFalse(notice.warning)
    }

    @Test
    fun `names the folder store on the clipboard route`() {
        val notice = SendMessages.of(
            SendReport(tasks = 2, batches = 0, streams = 0, route = SendRoute.NO_REPOSITORY, folder = ".y-review")
        )
        assertEquals(
            "The review channel carries the tasks of a git repository only, so the IDE wrote " +
                "2 tasks to .y-review and copied the prompt to the clipboard.",
            notice.text,
        )
        assertFalse(notice.warning)
    }

    @Test
    fun `reports a drop on the clipboard route too`() {
        val notice = SendMessages.of(
            SendReport(
                tasks = 4,
                batches = 0,
                streams = 0,
                dropped = 1,
                dropReason = BatchBuilder.PATH_REASON,
                route = SendRoute.NO_SESSION,
                folder = ".git/y-review",
            )
        )
        assertTrue(notice.text.endsWith("1 task was dropped, because the path breaks the channel rule."), notice.text)
    }

    @Test
    fun `speaks even when every task was dropped`() {
        val notice = SendMessages.of(
            SendReport(tasks = 0, batches = 0, streams = 1, dropped = 3, dropReason = BatchBuilder.ID_REASON)
        )
        assertTrue(notice.text.contains("3 tasks were dropped"), notice.text)
        assertTrue(notice.warning)
    }

    @Test
    fun `names the one session that took the tasks`() {
        val notice = SendMessages.of(SendReport(tasks = 3, batches = 1, streams = 1, targetName = "Claude 2"))

        assertEquals("The IDE sent 3 tasks to Claude 2.", notice.text)
        assertFalse(notice.warning)
    }

    @Test
    fun `warns when the chosen session left before the send`() {
        val notice = SendMessages.of(SendReport(tasks = 3, batches = 1, streams = 0, targetName = "Claude 2"))

        assertTrue(notice.warning)
        assertEquals("Claude 2 no longer reads this project, so the IDE sent nothing.", notice.text)
    }

    @Test
    fun `keeps the plural sentence when the send names no target`() {
        assertEquals(
            "The IDE sent 3 tasks to 2 sessions.",
            SendMessages.of(SendReport(tasks = 3, batches = 1, streams = 2)).text,
        )
    }
}
