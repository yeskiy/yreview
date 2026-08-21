package com.yeskiy.yreview.ui

import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CommentCardTest {

    private val time: (Comment) -> String = { "3 hours ago (Aug 18, 2026, 9:33 AM)" }

    private fun stored(
        ref: String = NoteRefs.LOCAL,
        text: String? = "first line\nsecond line",
        author: String = "a@b.c",
        resolved: Boolean? = null,
        startLine: Int? = 88,
    ): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = author,
            description = text,
            resolved = resolved,
            location = Location(
                commit = "0123456789abcdef0123456789abcdef01234567",
                path = "src/main/kotlin/Parser.kt",
                range = startLine?.let { Range(startLine = it, endLine = it + 6) },
            ),
        )
        return StoredComment(comment.id(), ref, comment)
    }

    @Test
    fun `the card names the author, the age and the text`() {
        val card = CommentCard.html(listOf(stored()), time)
        assertTrue(card.contains("<b>a@b.c</b>"), card)
        assertTrue(card.contains("3 hours ago (Aug 18, 2026, 9:33 AM)"), card)
        assertTrue(card.contains("first line"), card)
        assertTrue(card.contains("second line"), card)
    }

    @Test
    fun `the card states the lines, the ref and the state of the work`() {
        assertTrue(CommentCard.html(listOf(stored()), time).contains("lines 88-94, local, open"))
    }

    @Test
    fun `the card marks a shared comment`() {
        assertTrue(CommentCard.html(listOf(stored(ref = NoteRefs.DISCUSS)), time).contains("shared, open"))
    }

    @Test
    fun `the card marks a resolved comment`() {
        assertTrue(CommentCard.html(listOf(stored(resolved = true)), time).contains("local, resolved"))
    }

    @Test
    fun `the card states that a comment without a range has no lines`() {
        assertTrue(CommentCard.html(listOf(stored(startLine = null)), time).contains("no lines, local, open"))
    }

    @Test
    fun `the card names the empty text`() {
        assertTrue(CommentCard.html(listOf(stored(text = "   ")), time).contains(CommentCard.NO_TEXT))
    }

    @Test
    fun `the card holds one block per comment`() {
        val card = CommentCard.html(listOf(stored(author = "one@b.c"), stored(author = "two@b.c")), time)
        assertTrue(card.contains("<b>one@b.c</b>"), card)
        assertTrue(card.contains("<b>two@b.c</b>"), card)
        assertTrue(card.contains("<hr"), card)
    }

    @Test
    fun `the card escapes the markup of the text`() {
        val card = CommentCard.html(listOf(stored(text = "<script>alert(1)</script>")), time)
        assertFalse(card.contains("<script>"), card)
        assertTrue(card.contains("&lt;script&gt;"), card)
    }

    @Test
    fun `the card escapes the markup of the author`() {
        assertFalse(CommentCard.html(listOf(stored(author = "<img src=x>")), time).contains("<img"))
    }

    @Test
    fun `the plain card holds three lines per comment`() {
        assertEquals(
            "a@b.c, 3 hours ago (Aug 18, 2026, 9:33 AM)\n" +
                "lines 88-94, local, open\n" +
                "first line\nsecond line",
            CommentCard.plain(listOf(stored()), time),
        )
    }

    @Test
    fun `the plain card divides two comments with an empty line`() {
        assertTrue(
            CommentCard.plain(listOf(stored(author = "one@b.c"), stored(author = "two@b.c")), time)
                .contains("second line\n\ntwo@b.c"),
        )
    }
}
