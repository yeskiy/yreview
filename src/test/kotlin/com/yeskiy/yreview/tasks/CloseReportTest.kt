package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The sentence a person reads after a close.
 *
 * A problem never takes the place of the count. A user who resolved 200 rows of 250 must
 * read both numbers, and a user whose batch met one bad identifier must read the rest.
 */
class CloseReportTest {

    private val done = "The IDE resolved 200 comments."

    @Test
    fun `a report with no problem reads as the count alone`() {
        assertEquals(done, CloseReport(200).sentence(done))
    }

    @Test
    fun `a report with a problem still names the count`() {
        val text = CloseReport(200, listOf("It left 50 out.")).sentence(done)

        assertTrue(text.startsWith(done), "the count comes first: $text")
        assertTrue(text.contains("It left 50 out."), text)
    }

    @Test
    fun `a report with no words about the count reads as the problem alone`() {
        assertEquals("It left 50 out.", CloseReport(0, listOf("It left 50 out.")).sentence(""))
    }
}
