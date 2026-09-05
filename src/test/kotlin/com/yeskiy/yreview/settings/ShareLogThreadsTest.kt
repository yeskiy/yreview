package com.yeskiy.yreview.settings

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The log takes a mark from several threads at once.
 *
 * A comment reaches the log from the thread that draws the window, from a progress thread,
 * from the bridge and from the watch of the done files. The store of the IDE reads the
 * state on a thread of its own. A plain list loses a mark under that load, and it also
 * fails while the store walks it.
 */
class ShareLogThreadsTest {

    @Test
    fun `every mark of every thread reaches the log`() {
        val log = ShareLog()
        val failure = AtomicReference<Throwable?>(null)
        val start = CountDownLatch(1)
        val writers = (0 until WRITERS).map { writer ->
            Thread {
                runCatching {
                    start.await()
                    (0 until PER_WRITER).forEach { index -> log.markUnshared("c$writer-$index") }
                }.onFailure { failure.compareAndSet(null, it) }
            }
        }

        writers.forEach { it.start() }
        start.countDown()
        writers.forEach { it.join(DEADLINE_MS) }

        assertTrue(failure.get() == null, "no thread may fail: ${failure.get()}")
        assertEquals(WRITERS * PER_WRITER, log.getState().unshared.size)
    }

    @Test
    fun `the store reads the state while a thread marks a comment`() {
        val log = ShareLog()
        val failure = AtomicReference<Throwable?>(null)
        val stopped = AtomicBoolean(false)
        val writer = Thread {
            runCatching { (0 until MARKS).forEach { log.markUnshared("c$it") } }
                .onFailure { failure.compareAndSet(null, it) }
        }
        val reader = Thread {
            runCatching { while (!stopped.get()) log.getState().unshared.forEach { it.length } }
                .onFailure { failure.compareAndSet(null, it) }
        }

        reader.start()
        writer.start()
        writer.join(DEADLINE_MS)
        stopped.set(true)
        reader.join(DEADLINE_MS)

        assertTrue(failure.get() == null, "the store must read the log while a thread writes it: ${failure.get()}")
    }

    private companion object {
        const val WRITERS = 8
        const val PER_WRITER = 250
        const val MARKS = 2000
        const val DEADLINE_MS = 60_000L
    }
}
