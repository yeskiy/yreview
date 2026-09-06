package com.yeskiy.yreview.bridge

import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * The events of one open stream, with a bound and a count of the events beyond it.
 *
 * An event leaves the queue only while the thread of the reader runs, and that thread
 * stands inside its write for as long as the client reads nothing. A queue with no bound
 * would therefore grow with every send. This queue takes [bound] events, drops each event
 * that comes after them, and counts the drops. The reader then writes one line that names
 * the number.
 */
class StreamQueue(bound: Int = MAX_QUEUED) {

    private val events = LinkedBlockingQueue<String>(bound)

    private val dropped = AtomicInteger(0)

    /** Adds one event, or counts one loss when the queue already holds the bound. */
    fun add(event: String) {
        if (!events.offer(event)) dropped.incrementAndGet()
    }

    /** The event that came first, or null after [seconds] with no event at all. */
    fun next(seconds: Long): String? = events.poll(seconds, TimeUnit.SECONDS)

    /** The number of events this queue lost since the last call, and zero after it. */
    fun takeLoss(): Int = dropped.getAndSet(0)

    /** Drops every event that waits, and then holds [event] alone. */
    fun replaceWith(event: String) {
        events.clear()
        events.offer(event)
    }

    companion object {
        /**
         * How many events one stream holds while its client reads none.
         *
         * One send of the user makes one batch for each 200 comments, so this bound takes
         * several whole sends. A client that is still behind after that reads nothing at
         * all, and the plugin then keeps the events it already holds.
         */
        const val MAX_QUEUED = 64
    }
}
