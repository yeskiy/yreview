package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CommentRowTest {

    private fun stored(ref: String, text: String): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = "a@b.c",
            description = text,
            location = Location(
                commit = "0123456789abcdef0123456789abcdef01234567",
                path = "src/main/kotlin/Parser.kt",
                range = Range(startLine = 88, endLine = 94),
            ),
        )
        return StoredComment(comment.id(), ref, comment)
    }

    @Test
    fun `shows the path and the line range`() {
        val row = CommentRow.format(stored(NoteRefs.LOCAL, "fix this"), unshared = false)
        assertTrue(row.startsWith("src/main/kotlin/Parser.kt:88-94"), row)
    }

    @Test
    fun `marks a comment of the local ref as local`() {
        assertTrue(CommentRow.format(stored(NoteRefs.LOCAL, "fix this"), unshared = false).contains("[local]"))
    }

    @Test
    fun `marks a pushed comment as shared`() {
        assertTrue(CommentRow.format(stored(NoteRefs.DISCUSS, "fix this"), unshared = false).contains("[shared]"))
    }

    @Test
    fun `marks a comment whose push failed as not shared`() {
        assertTrue(CommentRow.format(stored(NoteRefs.DISCUSS, "fix this"), unshared = true).contains("[not shared]"))
    }

    @Test
    fun `shows only the first line of the comment text`() {
        val row = CommentRow.format(stored(NoteRefs.LOCAL, "first line\nsecond line"), unshared = false)
        assertTrue(row.endsWith("first line"), row)
    }

    @Test
    fun `a local comment cannot be marked as not shared`() {
        assertEquals(
            CommentRow.format(stored(NoteRefs.LOCAL, "fix this"), unshared = false),
            CommentRow.format(stored(NoteRefs.LOCAL, "fix this"), unshared = true),
        )
    }
}
