package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.store.Carry
import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.id
import com.yeskiy.yreview.tasks.Placed
import kotlin.test.Test
import kotlin.test.assertEquals

private const val COMMIT = "0123456789abcdef0123456789abcdef01234567"

class CommentIndexTest {

    private fun stored(path: String, startLine: Int?, text: String, endLine: Int? = null): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = "a@b.c",
            description = text,
            location = Location(
                commit = COMMIT,
                path = path,
                range = startLine?.let { Range(startLine = it, endLine = endLine ?: (it + 1)) },
            ),
        )
        return StoredComment(comment.id(), NoteRefs.LOCAL, COMMIT, comment)
    }

    private fun same(stored: StoredComment, start: Int, end: Int) = Placed(stored, Carry.Same(Range(startLine = start, endLine = end)))

    private fun placed(stored: StoredComment) = Placed(stored, Carry.Same(stored.comment.location?.range))

    @Test
    fun `keeps every comment that starts on the same line`() {
        val index = CommentIndex.byStartLine(listOf(stored("a.kt", 12, "first"), stored("a.kt", 12, "second")).map(::placed))
        assertEquals(1, index.size)
        assertEquals(listOf("first", "second"), index.getValue(12).map { it.stored.comment.description })
    }

    @Test
    fun `groups the comments by the first line of the range`() {
        val index = CommentIndex.byStartLine(listOf(stored("a.kt", 3, "up"), stored("a.kt", 88, "down")).map(::placed))
        assertEquals(setOf(3, 88), index.keys)
    }

    @Test
    fun `groups the comments by the first line of their mapped place`() {
        val index = CommentIndex.byStartLine(listOf(same(stored("a.kt", 3, "moved"), 9, 10)))
        assertEquals(setOf(9), index.keys)
    }

    @Test
    fun `drops a comment that has no range`() {
        assertEquals(emptyMap(), CommentIndex.byStartLine(listOf(placed(stored("a.kt", null, "no anchor")))))
    }

    @Test
    fun `keeps the range of every comment of the file, also two that overlap`() {
        assertEquals(
            listOf(Range(startLine = 10, endLine = 18), Range(startLine = 12, endLine = 20)),
            CommentIndex.ranges(
                listOf(stored("a.kt", 10, "outer", endLine = 18), stored("a.kt", 12, "inner", endLine = 20)).map(::placed),
            ),
        )
    }

    @Test
    fun `a comment without a range gives no range`() {
        assertEquals(emptyList(), CommentIndex.ranges(listOf(placed(stored("a.kt", null, "no anchor")))))
    }

    @Test
    fun `a mapped comment and a HEAD comment on the same lines cover them twice`() {
        val head = same(stored("a.kt", 7, "head", endLine = 8), 7, 8)
        val moved = same(stored("a.kt", 5, "old", endLine = 6), 7, 8)
        val marks = CommentMarks.of(listOf(head, moved))
        assertEquals(listOf(head, moved), marks.byLine.getValue(7))
        assertEquals(2, marks.covers.getValue(7))
    }

    @Test
    fun `an outdated comment has an icon and a dim range but no overlap`() {
        val head = same(stored("a.kt", 5, "head", endLine = 6), 5, 6)
        val old = Placed(stored("a.kt", 5, "old", endLine = 6), Carry.Outdated(Range(startLine = 5, endLine = 6), listOf("x")))
        val marks = CommentMarks.of(listOf(head, old))
        assertEquals(listOf(head, old), marks.byLine.getValue(5))
        assertEquals(listOf(Range(startLine = 5, endLine = 6)), marks.ranges)
        assertEquals(listOf(Range(startLine = 5, endLine = 6)), marks.dim)
        assertEquals(1, marks.covers.getValue(5))
    }

    @Test
    fun `a gone comment gives no mark`() =
        assertEquals(CommentMarks.EMPTY, CommentMarks.of(listOf(Placed(stored("a.kt", 1, "x"), Carry.Gone))))

    @Test
    fun `the box sits under the last shown line`() {
        assertEquals(12, CommentIndex.lastShownLine(listOf(same(stored("a.kt", 1, "moved", endLine = 2), 10, 12))))
    }

    @Test
    fun `counts the open comments that cover each icon line`() {
        val ranges = listOf(
            Range(startLine = 10, endLine = 20),
            Range(startLine = 12, startColumn = 4, endLine = 12, endColumn = 9),
            Range(startLine = 14, endLine = 11),
            Range(startLine = 30, endLine = 30),
        )

        assertEquals(mapOf(10 to 1, 11 to 2, 12 to 3, 30 to 1), CommentIndex.covers(ranges, setOf(10, 11, 12, 30)))
    }

    @Test
    fun `a line that no comment covers counts zero`() {
        assertEquals(mapOf(5 to 0), CommentIndex.covers(listOf(Range(startLine = 10, endLine = 20)), setOf(5)))
    }

    @Test
    fun `the box sits under the last line of one comment`() {
        assertEquals(20, CommentIndex.lastLine(listOf(stored("a.kt", 10, "one", endLine = 20))))
    }

    @Test
    fun `the box sits under the last line of every comment of the icon`() {
        assertEquals(
            30,
            CommentIndex.lastLine(
                listOf(stored("a.kt", 10, "short", endLine = 12), stored("a.kt", 10, "long", endLine = 30)),
            ),
        )
    }

    @Test
    fun `a range that ends before it starts still names its last line`() {
        assertEquals(9, CommentIndex.lastLine(listOf(stored("a.kt", 9, "reversed", endLine = 7))))
    }

    @Test
    fun `a comment without a range names no line`() {
        assertEquals(0, CommentIndex.lastLine(listOf(stored("a.kt", null, "no anchor"))))
    }

    @Test
    fun `an empty list names no line`() {
        assertEquals(0, CommentIndex.lastLine(emptyList()))
    }
}
