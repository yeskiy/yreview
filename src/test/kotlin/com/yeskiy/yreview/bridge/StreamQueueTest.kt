package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The bound of one event stream, and the count of the events beyond it.
 *
 * These tests drive the queue alone. The thread of a stream drains its queue for as long
 * as the socket takes bytes. A queue therefore fills only after the write of that thread
 * blocks, and the operating system decides that moment. Linux gives a loopback socket
 * buffers of several megabytes, and Windows gives it much less. A test that fills a socket
 * proves the bound on one platform and proves nothing on the next one.
 */
class StreamQueueTest {

    @Test
    fun `a queue keeps the events up to the bound`() {
        val queue = StreamQueue(BOUND)

        repeat(BOUND + BEYOND) { number -> queue.add("event $number") }

        assertEquals((0 until BOUND).map { "event $it" }, generateSequence { queue.next(0) }.toList())
    }

    @Test
    fun `a full queue counts every event beyond the bound`() {
        val queue = StreamQueue(BOUND)

        repeat(BOUND + BEYOND) { number -> queue.add("event $number") }

        assertEquals(BEYOND, queue.takeLoss())
    }

    @Test
    fun `a queue that holds every event counts no loss`() {
        val queue = StreamQueue(BOUND)

        repeat(BOUND) { number -> queue.add("event $number") }

        assertEquals(0, queue.takeLoss())
    }

    @Test
    fun `a queue gives one loss one time`() {
        val queue = StreamQueue(BOUND)
        repeat(BOUND + BEYOND) { number -> queue.add("event $number") }

        queue.takeLoss()

        assertEquals(0, queue.takeLoss(), "the stream must read the line of one loss one time")
    }

    @Test
    fun `a queue that takes the stop event drops the events it holds`() {
        val queue = StreamQueue(BOUND)
        repeat(BOUND) { number -> queue.add("event $number") }

        queue.replaceWith("stop")

        assertEquals(listOf("stop"), generateSequence { queue.next(0) }.toList())
    }

    private companion object {
        /** A bound small enough to read, because the number of the bound proves nothing. */
        const val BOUND = 3

        const val BEYOND = 2
    }
}
