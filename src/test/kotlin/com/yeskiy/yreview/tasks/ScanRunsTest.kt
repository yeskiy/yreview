package com.yeskiy.yreview.tasks

import com.intellij.openapi.progress.ProgressManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * A newer scan of one tab cancels the older scan, and a canceled scan gives no rows.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class ScanRunsTest : BasePlatformTestCase() {

    fun `test a scan that runs to the end gives its rows`() {
        val runs = ScanRuns()

        val outcome = runs.run(runs.next()) { "rows" }

        assertEquals("rows", outcome?.rows)
        assertNull(outcome?.failure)
    }

    fun `test a newer scan cancels the older one`() {
        val runs = ScanRuns()
        val older = runs.next()
        val newer = runs.next()

        assertTrue(older.isCanceled)
        assertFalse(newer.isCanceled)
    }

    fun `test a scan that a newer scan cancels on its way gives nothing`() {
        val runs = ScanRuns()
        val older = runs.next()
        val reads = mutableListOf<String>()

        val outcome = runs.run(older) {
            reads += "first step"
            runs.next()
            ProgressManager.checkCanceled()
            reads += "second step"
            "rows"
        }

        assertNull(outcome)
        assertEquals(listOf("first step"), reads)
    }

    fun `test a scan that ends after its cancel gives nothing`() {
        val runs = ScanRuns()
        val older = runs.next()

        assertNull(runs.run(older) { runs.next().let { "rows" } })
    }

    fun `test a closed tab cancels its open scan`() {
        val runs = ScanRuns()
        val open = runs.next()

        runs.cancel()

        assertTrue(open.isCanceled)
    }
}
