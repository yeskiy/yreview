package com.yeskiy.yreview.toolwindow

/**
 * The order guard of the preview pane.
 *
 * The pane reads the store on a pooled thread, and it draws the answer on the user interface
 * thread. Two reads can therefore overlap, and a read that started first can answer last. The
 * answer of the older read holds a comment that a delete already removed.
 *
 * Each read takes a ticket, and only the newest ticket may draw. A late answer therefore
 * changes nothing on the screen.
 *
 * Every method here runs on the user interface thread.
 */
class PreviewTicket {

    private var ticket = 0L

    /** Starts a read and gives the ticket that the answer of that read must carry. */
    fun start(): Long {
        ticket += 1
        return ticket
    }

    /** True when the ticket belongs to the newest read. A ticket of an older read is stale. */
    fun current(ticket: Long): Boolean = ticket == this.ticket
}
