package com.yeskiy.yreview.ui

import com.intellij.openapi.util.text.HtmlBuilder
import com.intellij.openapi.util.text.HtmlChunk
import com.yeskiy.yreview.store.Carry
import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.RangeText
import com.yeskiy.yreview.store.StoredComment

/**
 * The card that the gutter icon of a review comment shows. One block names the author, the age
 * and the state of one comment, and then holds the text. The editor paints the card with the
 * tooltip renderer of the platform, so the card is HTML and not a Swing panel.
 */
object CommentCard {

    const val NO_TEXT = "This comment has no text."

    const val ORIGINAL = "Original text:"

    /** The card of every comment of one line. [carry] holds the place of each comment by its identifier. */
    fun html(
        comments: List<StoredComment>,
        time: (Comment) -> String = CommentTime::label,
        carry: Map<String, Carry> = emptyMap(),
    ): String =
        HtmlBuilder()
            .appendWithSeparators(HtmlChunk.hr(), comments.map { block(it, time, carry[it.id]) })
            .wrapWithHtmlBody()
            .toString()

    /** The same card as plain text. A screen reader reads this form. */
    fun plain(
        comments: List<StoredComment>,
        time: (Comment) -> String = CommentTime::label,
        carry: Map<String, Carry> = emptyMap(),
    ): String =
        comments.joinToString("\n\n") { stored ->
            "${head(stored, time)}\n${state(stored, carry[stored.id])}\n${text(stored)}" +
                original(carry[stored.id])?.let { "\n$ORIGINAL\n" + it.joinToString("\n") }.orEmpty()
        }

    private fun block(stored: StoredComment, time: (Comment) -> String, carry: Carry?): HtmlChunk =
        HtmlBuilder()
            .append(HtmlChunk.text(stored.comment.author).bold())
            .append(HtmlChunk.nbsp(2))
            .append(HtmlChunk.text(time(stored.comment)))
            .br()
            .append(HtmlChunk.text(state(stored, carry)).italic())
            .br()
            .appendWithSeparators(HtmlChunk.br(), text(stored).lines().map { HtmlChunk.text(it) })
            .also { builder ->
                original(carry)?.let { lines ->
                    builder.br()
                        .append(HtmlChunk.text(ORIGINAL).italic())
                        .append(HtmlChunk.tag("pre").addText(lines.joinToString("\n")))
                }
            }
            .toFragment()

    private fun head(stored: StoredComment, time: (Comment) -> String): String =
        "${stored.comment.author}, ${time(stored.comment)}"

    /** The place of the comment, the ref that holds it, and the state of the work. */
    fun state(stored: StoredComment, carry: Carry? = null): String =
        listOfNotNull(
            "Outdated".takeIf { carry is Carry.Outdated },
            stored.comment.location?.range
                ?.let { (if (carry is Carry.Outdated) "was " else "") + RangeText.words(it) } ?: "no lines",
            if (NoteRefs.isShared(stored.ref)) "shared" else "local",
            if (stored.comment.resolved == true) "resolved" else "open",
        ).joinToString(", ")

    /** The lines that an outdated comment named, and null for any other place. */
    fun original(carry: Carry?): List<String>? = (carry as? Carry.Outdated)?.original

    private fun text(stored: StoredComment): String =
        stored.comment.description?.trim().orEmpty().ifEmpty { NO_TEXT }
}
