package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.StoredComment
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CommentPickTest {

    private fun stored(id: String, ref: String = NoteRefs.DISCUSS): StoredComment =
        StoredComment(
            id,
            ref,
            "c0ffee",
            Comment(timestamp = "1787194427", author = "a@b.c", location = Location("c0ffee", "a.kt")),
        )

    @Test
    fun `a closed switch keeps the open records alone`() {
        val kept = CommentPick.of(listOf(stored("one")), listOf(stored("two")), showResolved = false)

        assertEquals(listOf("one"), kept.map { it.stored.id })
        assertFalse(kept.single().resolved)
    }

    @Test
    fun `an open switch adds the resolved records`() {
        val kept = CommentPick.of(listOf(stored("one")), listOf(stored("two")), showResolved = true)

        assertEquals(listOf("one", "two"), kept.map { it.stored.id })
        assertFalse(kept.first().resolved)
        assertTrue(kept.last().resolved)
    }

    @Test
    fun `an empty store gives no record whatever the switch says`() {
        assertTrue(CommentPick.of(emptyList(), emptyList(), showResolved = true).isEmpty())
        assertTrue(CommentPick.of(emptyList(), emptyList(), showResolved = false).isEmpty())
    }

    @Test
    fun `a resolved record wins over every share word`() {
        assertEquals(
            CommentWord.RESOLVED,
            CommentWord.of(shared = true, worktree = false, unshared = false, resolved = true),
        )
        assertEquals(
            CommentWord.RESOLVED,
            CommentWord.of(shared = false, worktree = true, unshared = true, resolved = true),
        )
    }

    @Test
    fun `an open record keeps the three share words`() {
        assertEquals(
            CommentWord.LOCAL,
            CommentWord.of(shared = false, worktree = false, unshared = false, resolved = false),
        )
        assertEquals(
            CommentWord.NOT_SHARED,
            CommentWord.of(shared = true, worktree = true, unshared = false, resolved = false),
        )
        assertEquals(
            CommentWord.NOT_SHARED,
            CommentWord.of(shared = true, worktree = false, unshared = true, resolved = false),
        )
        assertEquals(
            CommentWord.SHARED,
            CommentWord.of(shared = true, worktree = false, unshared = false, resolved = false),
        )
    }
}
