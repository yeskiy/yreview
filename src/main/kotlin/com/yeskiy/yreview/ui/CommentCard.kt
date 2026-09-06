package com.yeskiy.yreview.ui

import com.intellij.openapi.util.text.HtmlBuilder
import com.intellij.openapi.util.text.HtmlChunk
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

    /** The card of every comment of one line. A rule divides two comments. */
    fun html(comments: List<StoredComment>, time: (Comment) -> String = CommentTime::label): String =
        HtmlBuilder()
            .appendWithSeparators(HtmlChunk.hr(), comments.map { block(it, time) })
            .wrapWithHtmlBody()
            .toString()

    /** The same card as plain text. A screen reader reads this form. */
    fun plain(comments: List<StoredComment>, time: (Comment) -> String = CommentTime::label): String =
        comments.joinToString("\n\n") { stored ->
            "${head(stored, time)}\n${state(stored)}\n${text(stored)}"
        }

    private fun block(stored: StoredComment, time: (Comment) -> String): HtmlChunk =
        HtmlBuilder()
            .append(HtmlChunk.text(stored.comment.author).bold())
            .append(HtmlChunk.nbsp(2))
            .append(HtmlChunk.text(time(stored.comment)))
            .br()
            .append(HtmlChunk.text(state(stored)).italic())
            .br()
            .appendWithSeparators(HtmlChunk.br(), text(stored).lines().map { HtmlChunk.text(it) })
            .toFragment()

    private fun head(stored: StoredComment, time: (Comment) -> String): String =
        "${stored.comment.author}, ${time(stored.comment)}"

    /** The place of the comment, the ref that holds it, and the state of the work. */
    fun state(stored: StoredComment): String =
        listOf(
            stored.comment.location?.range?.let { RangeText.words(it) } ?: "no lines",
            if (NoteRefs.isShared(stored.ref)) "shared" else "local",
            if (stored.comment.resolved == true) "resolved" else "open",
        ).joinToString(", ")

    private fun text(stored: StoredComment): String =
        stored.comment.description?.trim().orEmpty().ifEmpty { NO_TEXT }
}
