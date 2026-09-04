package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PushFallbackTest {

    private val prompt = "Read AGENT.md in .git/y-review and work through tasks.json."

    private val good = SendReport(tasks = 4, batches = 0, streams = 1, targetName = "Claude 1")

    private val refused = SendReport(
        tasks = 0,
        batches = 0,
        streams = 0,
        problem = "/tui/append-prompt answered 401.",
        targetName = "Claude 1",
    )

    @Test
    fun `a good push copies nothing`() {
        val result = PushFallback.of(good, prompt)

        assertNull(result.clipboard)
        assertFalse(result.report.copied)
        assertEquals(good, result.report)
    }

    @Test
    fun `a refused push hands the prompt to the clipboard`() {
        val result = PushFallback.of(refused, prompt)

        assertEquals(prompt, result.clipboard)
        assertTrue(result.report.copied)
    }

    @Test
    fun `a refused push keeps the problem, so the warning stays`() {
        val result = PushFallback.of(refused, prompt)

        assertEquals("/tui/append-prompt answered 401.", result.report.problem)
        assertTrue(SendMessages.of(result.report).warning)
    }

    @Test
    fun `the notice of a refused push names the problem and the clipboard`() {
        val notice = SendMessages.of(PushFallback.of(refused, prompt).report)

        assertEquals(
            "/tui/append-prompt answered 401. The IDE copied the prompt to the clipboard, so you can paste it.",
            notice.text,
        )
    }

    @Test
    fun `a problem that copied nothing keeps the plain text`() {
        val notice = SendMessages.of(refused)

        assertEquals("/tui/append-prompt answered 401.", notice.text)
    }
}
