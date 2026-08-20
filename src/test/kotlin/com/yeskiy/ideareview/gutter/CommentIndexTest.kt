package com.yeskiy.ideareview.gutter

import com.yeskiy.ideareview.store.Comment
import com.yeskiy.ideareview.store.Location
import com.yeskiy.ideareview.store.NoteRefs
import com.yeskiy.ideareview.store.Range
import com.yeskiy.ideareview.store.StoredComment
import com.yeskiy.ideareview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals

class CommentIndexTest {

    private fun stored(path: String, startLine: Int?, text: String): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = "a@b.c",
            description = text,
            location = Location(
                commit = "0123456789abcdef0123456789abcdef01234567",
                path = path,
                range = startLine?.let { Range(startLine = it, endLine = it + 1) },
            ),
        )
        return StoredComment(comment.id(), NoteRefs.LOCAL, comment)
    }

    @Test
    fun `keeps every comment that starts on the same line`() {
        val index = CommentIndex.byStartLine(
            listOf(stored("a.kt", 12, "first"), stored("a.kt", 12, "second")),
            "a.kt",
        )
        assertEquals(1, index.size)
        assertEquals(listOf("first", "second"), index.getValue(12).map { it.comment.description })
    }

    @Test
    fun `groups the comments by the first line of the range`() {
        val index = CommentIndex.byStartLine(
            listOf(stored("a.kt", 3, "up"), stored("a.kt", 88, "down")),
            "a.kt",
        )
        assertEquals(setOf(3, 88), index.keys)
    }

    @Test
    fun `drops the comments of another file`() {
        val index = CommentIndex.byStartLine(
            listOf(stored("a.kt", 3, "mine"), stored("b.kt", 3, "other")),
            "a.kt",
        )
        assertEquals(listOf("mine"), index.getValue(3).map { it.comment.description })
    }

    @Test
    fun `drops a comment that has no range`() {
        assertEquals(emptyMap(), CommentIndex.byStartLine(listOf(stored("a.kt", null, "no anchor")), "a.kt"))
    }
}
