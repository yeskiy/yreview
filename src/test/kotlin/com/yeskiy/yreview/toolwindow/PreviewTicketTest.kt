package com.yeskiy.yreview.toolwindow

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The order rule of the preview pane, without a display.
 *
 * The guard holds plain numbers alone, so a test drives it with plain calls.
 */
class PreviewTicketTest {

    @Test
    fun `the only read may draw`() {
        val guard = PreviewTicket()

        assertTrue(guard.current(guard.start()))
    }

    @Test
    fun `a second read makes the ticket of the first read stale`() {
        val guard = PreviewTicket()
        val first = guard.start()

        guard.start()

        assertFalse(guard.current(first), "the answer of the first read must not reach the pane")
    }

    @Test
    fun `an answer that arrives out of order draws nothing`() {
        val guard = PreviewTicket()
        val slow = guard.start()
        val fast = guard.start()

        assertTrue(guard.current(fast), "the newest read draws")
        assertFalse(guard.current(slow), "the read that started first answers last, so it draws nothing")
    }

    @Test
    fun `only the newest of many reads may draw`() {
        val guard = PreviewTicket()
        val tickets = (1..5).map { guard.start() }

        assertTrue(guard.current(tickets.last()))
        tickets.dropLast(1).forEach {
            assertFalse(guard.current(it), "an older read must not draw over the newest read")
        }
    }

    @Test
    fun `a ticket of no read is stale`() {
        val guard = PreviewTicket()
        guard.start()

        assertFalse(guard.current(0L), "a caller without a ticket must not draw")
    }
}
