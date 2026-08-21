package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The rules of the loading state of one tab, without a display.
 *
 * The tab holds these rules alone, so a test drives them with plain calls. The words of a
 * scan that found nothing come from the caller, because the changelist tab writes its own.
 */
class ScanStateTest {

    private val found = "This scope has no open review task."

    // --- A tab that never scanned ---

    @Test
    fun `a new tab waits for its first scan`() {
        val state = ScanState()

        assertEquals(ScanPhase.NEW, state.phase)
        assertTrue(state.loading)
    }

    @Test
    fun `a new tab does not say that the scope is empty`() {
        assertEquals(ScanState.READ_LONG, ScanState().emptyText(found))
    }

    // --- A scan in flight ---

    @Test
    fun `a scan in flight keeps the loading state`() {
        val state = ScanState()
        state.start(indexing = false)

        assertEquals(ScanPhase.RUNNING, state.phase)
        assertTrue(state.loading)
        assertEquals(ScanState.READ_LONG, state.emptyText(found))
        assertEquals(ScanState.READ_SHORT, state.loadingText)
    }

    @Test
    fun `a scan in flight keeps the loading state of a tab that scanned before`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)
        state.start(indexing = false)

        assertTrue(state.loading)
        assertEquals(ScanState.READ_LONG, state.emptyText(found))
    }

    // --- A scan that failed ---

    @Test
    fun `a scan that failed stops the loading state`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = true)

        assertEquals(ScanPhase.FAILED, state.phase)
        assertFalse(state.loading)
    }

    @Test
    fun `a scan that failed says so and does not name an empty scope`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = true)

        assertEquals(ScanState.FAILED_LONG, state.emptyText(found))
    }

    // --- A read that throws ---

    @Test
    fun `a read that throws gives no rows and keeps the reason`() {
        val outcome = readScope<List<String>> { throw IllegalStateException("git did not answer") }

        assertNull(outcome.rows)
        assertEquals("git did not answer", outcome.failure?.message)
    }

    @Test
    fun `a read that throws stops the spinner of its own scan`() {
        val state = ScanState()
        val ticket = state.start(indexing = false)
        val outcome = readScope<List<String>> { throw IllegalStateException("git did not answer") }

        assertTrue(state.finish(ticket, outcome.rows == null))
        assertFalse(state.loading)
        assertEquals(ScanState.FAILED_LONG, state.emptyText(found))
    }

    @Test
    fun `a read that gives rows keeps no reason`() {
        val outcome = readScope { listOf("a.kt") }

        assertEquals(listOf("a.kt"), outcome.rows)
        assertNull(outcome.failure)
    }

    @Test
    fun `a read of a project that went away gives no rows and no reason`() {
        val outcome = readScope<List<String>> { null }

        assertNull(outcome.rows)
        assertNull(outcome.failure)
    }

    @Test
    fun `a read that throws under a later scan leaves that scan alone`() {
        val state = ScanState()
        val first = state.start(indexing = false)
        state.start(indexing = false)
        val outcome = readScope<List<String>> { throw IllegalStateException("git did not answer") }

        assertFalse(state.finish(first, outcome.rows == null))
        assertEquals(ScanPhase.RUNNING, state.phase)
        assertTrue(state.loading)
    }

    // --- The IDE builds the index ---

    @Test
    fun `a scan that starts while the IDE builds the index names the index`() {
        val state = ScanState()
        state.start(indexing = true)

        assertEquals(ScanPhase.INDEXING, state.phase)
        assertTrue(state.loading)
        assertEquals(ScanState.INDEX_LONG, state.emptyText(found))
        assertEquals(ScanState.INDEX_SHORT, state.loadingText)
    }

    @Test
    fun `an index that starts under an open scan names the index`() {
        val state = ScanState()
        state.start(indexing = false)
        state.enterIndexing()

        assertEquals(ScanPhase.INDEXING, state.phase)
    }

    @Test
    fun `an index that starts under a new tab names the index`() {
        val state = ScanState()
        state.enterIndexing()

        assertEquals(ScanPhase.INDEXING, state.phase)
    }

    @Test
    fun `an index leaves the rows of a finished scan alone`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)
        state.enterIndexing()

        assertEquals(ScanPhase.READY, state.phase)
        assertEquals(found, state.emptyText(found))
    }

    @Test
    fun `the tab still waits after the index is complete`() {
        val state = ScanState()
        state.start(indexing = true)
        state.exitIndexing()

        assertEquals(ScanPhase.RUNNING, state.phase)
        assertTrue(state.loading)
        assertEquals(ScanState.READ_LONG, state.emptyText(found))
    }

    @Test
    fun `the end of an index leaves a finished scan alone`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)
        state.exitIndexing()

        assertEquals(ScanPhase.READY, state.phase)
    }

    @Test
    fun `a scan that waits for the index still ends when it fails`() {
        val state = ScanState()
        state.finish(state.start(indexing = true), failed = true)

        assertFalse(state.loading)
    }

    // --- A scan that finished and found nothing ---

    @Test
    fun `a finished scan keeps the words of the caller`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)

        assertEquals(ScanPhase.READY, state.phase)
        assertFalse(state.loading)
        assertEquals(found, state.emptyText(found))
    }

    @Test
    fun `a finished scan of the changelist tab keeps the words of that tab`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)

        assertEquals(
            "No file is in the changelist \"Changes\".",
            state.emptyText(ChangeListTab.emptyText(ChangeListFacts(vcsFound = true, listName = "Changes"))),
        )
    }

    // --- Two scans that overlap ---

    @Test
    fun `only the newest scan carries a current ticket`() {
        val state = ScanState()
        val first = state.start(indexing = false)
        val second = state.start(indexing = false)

        assertFalse(state.current(first))
        assertTrue(state.current(second))
    }

    @Test
    fun `a late scan does not stop the spinner of a later scan`() {
        val state = ScanState()
        val first = state.start(indexing = false)
        state.start(indexing = false)

        assertFalse(state.finish(first, failed = false))
        assertEquals(ScanPhase.RUNNING, state.phase)
        assertTrue(state.loading)
    }

    @Test
    fun `a late scan that failed does not write over a later scan`() {
        val state = ScanState()
        val first = state.start(indexing = false)
        val second = state.start(indexing = false)
        state.finish(second, failed = false)

        assertFalse(state.finish(first, failed = true))
        assertEquals(ScanPhase.READY, state.phase)
        assertEquals(found, state.emptyText(found))
    }

    @Test
    fun `the newest scan writes its result`() {
        val state = ScanState()
        state.start(indexing = false)
        val second = state.start(indexing = false)

        assertTrue(state.finish(second, failed = false))
        assertEquals(ScanPhase.READY, state.phase)
    }

    @Test
    fun `a tab that never scanned rejects every ticket of a scan`() {
        assertFalse(ScanState().current(1L))
    }

    // --- A tab that holds rows ---

    @Test
    fun `a new tab holds no row`() {
        assertEquals(0, ScanState().rows)
    }

    @Test
    fun `a tab with no row runs its next scan with a spinner`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)
        state.rows = 0
        state.start(indexing = false)

        assertTrue(state.loading)
    }

    @Test
    fun `a tab with rows runs its next scan without a spinner`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)
        state.rows = 3
        state.start(indexing = false)

        assertEquals(ScanPhase.RUNNING, state.phase)
        assertFalse(state.loading)
    }

    @Test
    fun `a tab with rows waits for the index without a spinner`() {
        val state = ScanState()
        state.finish(state.start(indexing = false), failed = false)
        state.rows = 3
        state.start(indexing = true)

        assertEquals(ScanPhase.INDEXING, state.phase)
        assertFalse(state.loading)
    }

    @Test
    fun `an index that starts over rows runs no spinner`() {
        val state = ScanState()
        state.rows = 3
        state.enterIndexing()

        assertEquals(ScanPhase.INDEXING, state.phase)
        assertFalse(state.loading)
    }

    @Test
    fun `a scan that empties the tree stops the spinner`() {
        val state = ScanState()
        state.rows = 3
        val ticket = state.start(indexing = false)
        state.rows = 0

        assertTrue(state.finish(ticket, failed = false))
        assertFalse(state.loading)
        assertEquals(found, state.emptyText(found))
    }

    @Test
    fun `a tab that lost its rows runs its next scan with a spinner`() {
        val state = ScanState()
        state.rows = 3
        state.finish(state.start(indexing = false), failed = false)
        state.rows = 0
        state.start(indexing = false)

        assertTrue(state.loading)
        assertEquals(ScanState.READ_LONG, state.emptyText(found))
    }

    @Test
    fun `a scan that failed over rows runs no spinner`() {
        val state = ScanState()
        state.rows = 3
        state.finish(state.start(indexing = false), failed = true)

        assertEquals(ScanPhase.FAILED, state.phase)
        assertFalse(state.loading)
    }

    @Test
    fun `a tab with rows still names the index beside the spinner of a later empty scan`() {
        val state = ScanState()
        state.rows = 3
        state.start(indexing = true)
        state.rows = 0

        assertTrue(state.loading)
        assertEquals(ScanState.INDEX_SHORT, state.loadingText)
    }
}
