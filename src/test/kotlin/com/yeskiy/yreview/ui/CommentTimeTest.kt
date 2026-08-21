package com.yeskiy.yreview.ui

import com.yeskiy.yreview.store.Comment
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CommentTimeTest {

    private val now = 1787194427000L

    private fun ago(millis: Long): String = CommentTime.relative((now - millis) / 1000, now)

    @Test
    fun `a comment of a few seconds reads as moments ago`() {
        assertEquals("moments ago", ago(5_000))
    }

    @Test
    fun `a comment of three hours reads as three hours ago`() {
        assertEquals("3 hours ago", ago(3 * 3_600_000))
    }

    @Test
    fun `a comment of five days reads as five days ago`() {
        assertEquals("5 days ago", ago(5 * 24 * 3_600_000L))
    }

    @Test
    fun `the seconds come from the timestamp of the record`() {
        assertEquals(1787194427L, CommentTime.secondsOf(Comment(timestamp = "1787194427", author = "a@b.c")))
    }

    @Test
    fun `a timestamp that holds no number has no seconds`() {
        assertNull(CommentTime.secondsOf(Comment(timestamp = "later", author = "a@b.c")))
    }

    @Test
    fun `a record without a readable time carries the unknown label`() {
        assertEquals(CommentTime.UNKNOWN, CommentTime.label(Comment(timestamp = "", author = "a@b.c")))
    }
}
