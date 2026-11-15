package com.yeskiy.yreview.store

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CommentJsonTest {

    private val sample = Comment(
        timestamp = "1787194427",
        author = "reviewer@example.com",
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

    @Test
    fun `location text is the last key and the identifier leaves it out`() {
        val case = Json.parseToJsonElement(Files.readString(Path.of("spec", "vectors", "carry.json")))
            .jsonObject.getValue("compat").jsonArray.first().jsonObject
        val comment = Comment(
            timestamp = "1787194427",
            author = "a@b.c",
            description = "Check this.",
            location = Location(
                commit = "0123456789abcdef0123456789abcdef01234567",
                path = "src/a.txt",
                range = Range(startLine = 2, endLine = 3),
                text = "b\nc",
            ),
        )
        assertEquals(case.getValue("line").jsonPrimitive.content, CommentJson.encode(comment))
        assertTrue(CommentJson.encode(comment).endsWith("\"text\":\"b\\nc\"}}"))
        assertEquals(case.getValue("id").jsonPrimitive.content, comment.id())
    }
}
