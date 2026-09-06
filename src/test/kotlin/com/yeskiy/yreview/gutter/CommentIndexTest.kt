package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private const val COMMIT = "0123456789abcdef0123456789abcdef01234567"

/** How many spans the cost guard builds. A file can hold one comment for every line. */
private const val MANY_SPANS = 100_000

/**
 * How long the merge of [MANY_SPANS] spans may take.
 *
 * The bound is far above the real time of one pass, so a slow machine still passes. A
 * merge that builds a new list for each step needs several times longer than this.
 */
private const val MERGE_LIMIT_MILLIS = 2_000L

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

    @Test
    fun `one comment covers the lines of its range`() {
        assertEquals(
            listOf(10..20),
            CommentIndex.lineSpans(listOf(stored("a.kt", 10, "one", endLine = 20)), "a.kt"),
        )
    }

    @Test
    fun `two spans that overlap become one span`() {
        assertEquals(
            listOf(10..20),
            CommentIndex.lineSpans(
                listOf(stored("a.kt", 10, "outer", endLine = 18), stored("a.kt", 12, "inner", endLine = 20)),
                "a.kt",
            ),
        )
    }

    @Test
    fun `a span inside another span adds no second mark`() {
        assertEquals(
            listOf(10..30),
            CommentIndex.lineSpans(
                listOf(stored("a.kt", 10, "outer", endLine = 30), stored("a.kt", 15, "inner", endLine = 16)),
                "a.kt",
            ),
        )
    }

    @Test
    fun `two spans that touch become one span`() {
        assertEquals(
            listOf(10..25),
            CommentIndex.lineSpans(
                listOf(stored("a.kt", 10, "first", endLine = 14), stored("a.kt", 15, "second", endLine = 25)),
                "a.kt",
            ),
        )
    }

    @Test
    fun `two spans with a gap stay apart`() {
        assertEquals(
            listOf(10..14, 20..25),
            CommentIndex.lineSpans(
                listOf(stored("a.kt", 20, "down", endLine = 25), stored("a.kt", 10, "up", endLine = 14)),
                "a.kt",
            ),
        )
    }

    @Test
    fun `a span of another file is not covered`() {
        assertEquals(
            listOf(3..4),
            CommentIndex.lineSpans(listOf(stored("a.kt", 3, "mine"), stored("b.kt", 40, "other")), "a.kt"),
        )
    }

    @Test
    fun `a range that ends before it starts still covers its lines`() {
        assertEquals(
            listOf(7..9),
            CommentIndex.lineSpans(listOf(stored("a.kt", 9, "reversed", endLine = 7)), "a.kt"),
        )
    }

    @Test
    fun `a comment without a range covers no line`() {
        assertEquals(emptyList(), CommentIndex.lineSpans(listOf(stored("a.kt", null, "no anchor")), "a.kt"))
    }

    @Test
    fun `a file with a mark on many lines merges in one pass`() {
        val many = (0 until MANY_SPANS).map { stored("a.kt", it * 3 + 1, "note", endLine = it * 3 + 1) }

        val started = System.nanoTime()
        val spans = CommentIndex.lineSpans(many, "a.kt")
        val took = (System.nanoTime() - started) / 1_000_000

        assertEquals(MANY_SPANS, spans.size)
        assertTrue(took < MERGE_LIMIT_MILLIS, "the merge of $MANY_SPANS spans took $took ms")
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
