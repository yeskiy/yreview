package com.yeskiy.yreview.tasks

/**
 * What one tab of the review window knows about the scan of its scope.
 *
 * A tab must not name a fact that no scan established. Before the first scan ends, the tab
 * therefore shows a loading state, and not the words of an empty scope.
 */
enum class ScanPhase {

    /** No scan started, so the tab knows nothing about its scope. */
    NEW,

    /** A scan runs now. */
    RUNNING,

    /** The IDE builds the index, so the scan waits for it. */
    INDEXING,

    /** The last scan stopped before it read the scope. */
    FAILED,

    /** The last scan finished, so the tree shows what the scope holds. */
    READY,
}

/** The rows one scan read, and the reason of a scan that read none. */
data class ScanOutcome<T>(val rows: T?, val failure: Throwable?)

/**
 * Runs one read of a scope.
 *
 * A read that throws gives no rows, and it keeps the reason for the log. The caller
 * therefore reports an outcome on every path out of the read, and the tab always leaves
 * the loading state.
 */
fun <T> readScope(read: () -> T?): ScanOutcome<T> =
    try {
        ScanOutcome(read(), null)
    } catch (failure: Throwable) {
        ScanOutcome(null, failure)
    }

/**
 * The scan state of one tab.
 *
 * The reload queue merges the signals of one moment, so two scans can overlap. Each scan
 * takes a ticket, and only the newest ticket writes a result. A late scan therefore cannot
 * stop the spinner of a later scan, and it cannot write its rows over newer rows.
 *
 * Every method here runs on the user interface thread.
 */
class ScanState {

    var phase: ScanPhase = ScanPhase.NEW
        private set

    private var ticket = 0L

    /** Starts a scan and gives the ticket that the result of the scan must carry. */
    fun start(indexing: Boolean): Long {
        phase = if (indexing) ScanPhase.INDEXING else ScanPhase.RUNNING
        ticket += 1
        return ticket
    }

    /** True when the ticket belongs to the newest scan. A ticket of an older scan is stale. */
    fun current(ticket: Long): Boolean = ticket == this.ticket

    /**
     * Closes the newest scan and gives true when the caller may draw the result.
     *
     * A stale ticket changes nothing, so a late scan leaves both the phase and the rows of
     * the newer scan alone.
     */
    fun finish(ticket: Long, failed: Boolean): Boolean {
        if (!current(ticket)) return false
        phase = if (failed) ScanPhase.FAILED else ScanPhase.READY
        return true
    }

    /** The IDE started to build the index, so an open scan waits for that index. */
    fun enterIndexing() {
        if (phase == ScanPhase.NEW || phase == ScanPhase.RUNNING) phase = ScanPhase.INDEXING
    }

    /** The IDE finished the index. The tab queues a scan at once, so the wait goes on. */
    fun exitIndexing() {
        if (phase == ScanPhase.INDEXING) phase = ScanPhase.RUNNING
    }

    /** True while the tab waits for a result. The spinner runs in that time. */
    val loading: Boolean
        get() = phase == ScanPhase.NEW || phase == ScanPhase.RUNNING || phase == ScanPhase.INDEXING

    /** The words beside the spinner. */
    val loadingText: String
        get() = if (phase == ScanPhase.INDEXING) INDEX_SHORT else READ_SHORT

    /**
     * The words of the empty tree.
     *
     * [finished] holds the words of a scan that ran to the end and found nothing. The tab
     * shows them for that one case, and it explains itself in every other case.
     */
    fun emptyText(finished: String): String = when (phase) {
        ScanPhase.INDEXING -> INDEX_LONG
        ScanPhase.FAILED -> FAILED_LONG
        ScanPhase.READY -> finished
        else -> READ_LONG
    }

    companion object {

        const val READ_SHORT = "The plugin reads the review tasks."

        const val READ_LONG = "The plugin reads the review tasks of this scope."

        const val INDEX_SHORT = "The IDE builds the index."

        const val INDEX_LONG = "The IDE builds the index. The tasks arrive when the index is complete."

        const val FAILED_LONG = "The plugin did not read the review tasks. Use the Refresh button."
    }
}
