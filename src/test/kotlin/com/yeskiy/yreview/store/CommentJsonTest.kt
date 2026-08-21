package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CommentJsonTest {

    private val sample = Comment(
        timestamp = "1787194427",
        author = "39830788+yeskiy@users.noreply.github.com",
        description = "This branch never runs when the input is empty.",
        location = Location(
            commit = "4f2c8b1",
            path = "src/main/kotlin/Parser.kt",
            range = Range(startLine = 88, endLine = 94),
        ),
    )

    @Test
    fun `encodes to a single line`() {
        val line = CommentJson.encode(sample)
        assertEquals(1, line.lines().size)
    }

    @Test
    fun `round trips without loss`() {
        assertEquals(sample, CommentJson.decode(CommentJson.encode(sample)))
    }

    @Test
    fun `keeps the timestamp as a ten digit string`() {
        val line = CommentJson.encode(sample)
        assertTrue(line.contains("\"timestamp\":\"1787194427\""), line)
    }

    @Test
    fun `accepts a line written by another tool`() {
        val line = """{"timestamp":"1700000000","author":"a@b.c","description":"hi","v":0}"""
        val decoded = CommentJson.decode(line)
        assertEquals("a@b.c", decoded.author)
        assertEquals(null, decoded.location)
    }

    @Test
    fun `ignores fields it does not know`() {
        val line = """{"timestamp":"1700000000","author":"a@b.c","futureField":true}"""
        assertEquals("a@b.c", CommentJson.decode(line).author)
    }

    @Test
    fun `the id is stable and differs between comments`() {
        val other = sample.copy(description = "something else")
        assertEquals(sample.id(), sample.copy().id())
        assertTrue(sample.id() != other.id())
        assertEquals(40, sample.id().length)
    }
}
