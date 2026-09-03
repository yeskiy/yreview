package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.store.StoredComment

/** What the preview pane holds after a write, and whether the pane draws the card again. */
data class CardMove(val comment: StoredComment?, val redraw: Boolean)

/**
 * The rule that compares the card of the preview pane with the records of the store.
 *
 * A delete removes the record from the note. A resolve adds a record that closes the
 * comment, and the store then reports the comment as closed. Both writes therefore remove
 * the comment from the open records, and the pane then removes its card.
 *
 * A comment that the store still reports keeps its card, and the pane draws nothing. A
 * redraw of the same card would remove the card from the screen and draw it again.
 *
 * The rule reads plain values, so a test runs it without a running IDE.
 */
object CardChoice {

    /**
     * The card after one write. [open] holds the open records of the note behind the card.
     *
     * A record carries the digest of its own text as an identifier, so the rule matches on
     * that identifier. Two comments on the same lines therefore stay apart.
     */
    fun after(wanted: StoredComment?, open: List<StoredComment>): CardMove {
        val next = wanted?.let { card -> open.firstOrNull { it.id == card.id } }
        return CardMove(next, next != wanted)
    }
}
