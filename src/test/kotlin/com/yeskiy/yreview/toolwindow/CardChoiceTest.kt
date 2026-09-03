package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val COMMIT = "0123456789abcdef0123456789abcdef01234567"

class CardChoiceTest {

    private fun stored(text: String, line: Int = 10): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = "a@b.c",
            description = text,
            location = Location(commit = COMMIT, path = "a.kt", range = Range(startLine = line, endLine = line)),
        )
        return StoredComment(comment.id(), NoteRefs.LOCAL, COMMIT, comment)
    }

    private fun book(repo: TempRepo) =
        CommentBook(NotesGateway(repo.git), author = "test@example.com", clock = { 1787194427L })

    @Test
    fun `keeps the card of a comment the store still holds`() {
        val card = stored("look here")

        val move = CardChoice.after(card, listOf(card, stored("and here", line = 40)))

        assertEquals(card, move.comment)
        assertFalse(move.redraw)
    }

    @Test
    fun `drops the card of a comment the store lost`() {
        val move = CardChoice.after(stored("look here"), listOf(stored("and here", line = 40)))

        assertNull(move.comment)
        assertTrue(move.redraw)
    }

    @Test
    fun `drops the card when the store holds no comment at all`() {
        val move = CardChoice.after(stored("look here"), emptyList())

        assertNull(move.comment)
        assertTrue(move.redraw)
    }

    @Test
    fun `a pane without a card draws nothing`() {
        val move = CardChoice.after(null, listOf(stored("and here", line = 40)))

        assertNull(move.comment)
        assertFalse(move.redraw)
    }

    @Test
    fun `a delete removes the card from the pane`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val card = book(repo).add(NoteRefs.LOCAL, head, "a.kt", 10, 12, "look here")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", 40, 41, "and here")
            book(repo).remove(listOf(card))

            val move = CardChoice.after(card, book(repo).open(head))

            assertNull(move.comment)
            assertTrue(move.redraw)
        }
    }

    @Test
    fun `a resolve removes the card from the pane`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val card = book(repo).add(NoteRefs.LOCAL, head, "a.kt", 10, 12, "look here")
            book(repo).resolve(card)

            val move = CardChoice.after(card, book(repo).open(head))

            assertNull(move.comment)
            assertTrue(move.redraw)
        }
    }

    @Test
    fun `a write beside the card keeps that card`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val card = book(repo).add(NoteRefs.LOCAL, head, "a.kt", 10, 12, "look here")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", 40, 41, "and here")

            val move = CardChoice.after(card, book(repo).open(head))

            assertEquals(card, move.comment)
            assertFalse(move.redraw)
        }
    }
}
