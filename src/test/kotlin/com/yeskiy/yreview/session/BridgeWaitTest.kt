package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class BridgeWaitTest {

    private val ready = BridgeLookup.Available("http://127.0.0.1:52431", "0123456789abcdef0123")

    private val missing = BridgeLookup.Unavailable("The bridge server did not write a file for this project.")

    /** A clock that only moves when the poll sleeps, so every test result is exact. */
    private class FakeClock {

        private var current = 0L

        val pauses = mutableListOf<Long>()

        fun read(): Long = current

        fun pause(millis: Long) {
            pauses.add(millis)
            current += millis
        }
    }

    /** Answers the reads in order, then repeats the last answer. */
    private class FakeBridge(private val answers: List<BridgeLookup>) {

        var reads = 0
            private set

        fun read(): BridgeLookup {
            val answer = answers[minOf(reads, answers.lastIndex)]
            reads += 1
            return answer
        }
    }

    @Test
    fun `a ready bridge returns at the first read`() {
        val clock = FakeClock()
        val bridge = FakeBridge(listOf(ready))
        assertEquals(ready, BridgeWait.poll(1000, 100, clock::read, clock::pause, bridge::read))
        assertEquals(1, bridge.reads)
        assertTrue(clock.pauses.isEmpty())
    }

    @Test
    fun `the poll waits for a bridge that arrives late`() {
        val clock = FakeClock()
        val bridge = FakeBridge(listOf(missing, missing, ready))
        assertEquals(ready, BridgeWait.poll(1000, 100, clock::read, clock::pause, bridge::read))
        assertEquals(3, bridge.reads)
        assertEquals(listOf(100L, 100L), clock.pauses)
    }

    @Test
    fun `the poll gives up when the time runs out`() {
        val clock = FakeClock()
        val bridge = FakeBridge(listOf(missing))
        assertIs<BridgeLookup.Unavailable>(BridgeWait.poll(250, 100, clock::read, clock::pause, bridge::read))
        assertEquals(4, bridge.reads)
        assertEquals(listOf(100L, 100L, 100L), clock.pauses)
    }

    @Test
    fun `the poll keeps the reason of the last read`() {
        val clock = FakeClock()
        val bridge = FakeBridge(listOf(missing))
        val found = BridgeWait.poll(0, 100, clock::read, clock::pause, bridge::read)
        assertEquals(missing.reason, assertIs<BridgeLookup.Unavailable>(found).reason)
        assertEquals(1, bridge.reads)
        assertTrue(clock.pauses.isEmpty())
    }

    @Test
    fun `a session waits at most three seconds for the bridge`() {
        assertEquals(3000L, BridgeWait.WAIT_MILLIS)
        assertTrue(BridgeWait.STEP_MILLIS in 1..BridgeWait.WAIT_MILLIS)
    }
}
