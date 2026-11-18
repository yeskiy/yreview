package com.yeskiy.yreview.tasks

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ParallelReadsTest {

    @Test
    fun `keeps the order of the input`() {
        assertEquals((1..20).map { it * 2 }, ParallelReads.map((1..20).toList(), {}) { Thread.sleep((20 - it).toLong()); it * 2 })
    }

    @Test
    fun `runs two reads at the same time`() {
        val both = CountDownLatch(2)
        val answers = ParallelReads.map(listOf(1, 2), {}) { both.countDown(); both.await(5, TimeUnit.SECONDS) }
        assertEquals(listOf(true, true), answers)
    }

    @Test
    fun `a nested call on every pool thread ends`() {
        val outer = (1..16).toList()
        val sums = ParallelReads.map(outer, {}) { n -> ParallelReads.map((1..8).toList(), {}) { it + n }.sum() }
        assertEquals(outer.map { n -> (1..8).sum() + 8 * n }, sums)
    }

    @Test
    fun `gives the first failure to the caller`() {
        assertFailsWith<IllegalStateException> { ParallelReads.map(listOf(1, 2, 3), {}) { check(it != 2) { "two" } } }
    }

    @Test
    fun `a cancel of the caller stops the wait`() {
        class Stop : RuntimeException()
        val start = System.nanoTime()
        assertFailsWith<Stop> {
            ParallelReads.map(listOf(1, 2), { if (System.nanoTime() - start > 50_000_000) throw Stop() }) { Thread.sleep(5_000) }
        }
        assertTrue(System.nanoTime() - start < 2_000_000_000)
    }
}
