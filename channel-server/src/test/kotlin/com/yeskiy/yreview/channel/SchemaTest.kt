package com.yeskiy.yreview.channel

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SchemaTest {

    private fun comment(
        id: String = "c3f9a12aabbccddeeff00112233445566778899a",
        path: String = "src/main/kotlin/Parser.kt",
        startLine: String = "88",
        endLine: String = "94",
        revision: String = "HEAD",
        text: String = "This branch never runs when the input is empty.",
        extra: String = "",
    ): String = """{"id":"$id","path":"$path","startLine":$startLine,"endLine":$endLine,""" +
        """"revision":"$revision","text":"$text"$extra}"""

    private fun batch(
        batchId: String = "b7f2a91",
        branch: String = "feat/channel-server",
        commit: String = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments: String = comment(),
        extra: String = "",
    ): String = """{"batchId":"$batchId","branch":"$branch","commit":"$commit","comments":[$comments]$extra}"""

    private fun accepts(text: String): Boolean = BatchSchema.parse(text) is BatchParse.Ok

    @Test
    fun `accepts a batch that follows the contract`() {
        assertTrue(accepts(batch()))
    }

    @Test
    fun `accepts the left and the right side of a diff`() {
        assertTrue(accepts(batch(comments = comment(extra = ""","side":"left""""))))
        assertTrue(accepts(batch(comments = comment(extra = ""","side":"right""""))))
    }

    @Test
    fun `accepts the character fields of a comment`() {
        assertTrue(accepts(batch(comments = comment(extra = ""","startColumn":4,"endColumn":9"""))))
    }

    @Test
    fun `rejects a negative character position`() {
        assertFalse(accepts(batch(comments = comment(extra = ""","startColumn":-1"""))))
    }

    @Test
    fun `rejects a side that is neither left nor right`() {
        assertFalse(accepts(batch(comments = comment(extra = ""","side":"middle""""))))
    }

    @Test
    fun `rejects a field that the contract does not name`() {
        assertFalse(accepts(batch(extra = ""","author":"someone@example.com"""")))
    }

    @Test
    fun `rejects a comment field that the contract does not name`() {
        assertFalse(accepts(batch(comments = comment(extra = ""","resolved":true"""))))
    }

    @Test
    fun `rejects a path that holds a line break`() {
        assertFalse(accepts(batch(comments = comment(path = "a.kt\\nb.kt"))))
    }

    @Test
    fun `rejects a branch that holds a line break`() {
        assertFalse(accepts(batch(branch = "main\\nother")))
    }

    @Test
    fun `rejects an id that holds a character outside the safe set`() {
        assertFalse(accepts(batch(comments = comment(id = "c3f9a12 tag"))))
    }

    @Test
    fun `rejects a batch id that holds a character outside the safe set`() {
        assertFalse(accepts(batch(batchId = "b7f2a91/../etc")))
    }

    @Test
    fun `rejects a line number that is not a whole number`() {
        assertFalse(accepts(batch(comments = comment(startLine = "1.5"))))
    }

    @Test
    fun `rejects a negative line number`() {
        assertFalse(accepts(batch(comments = comment(startLine = "-1"))))
    }

    @Test
    fun `rejects a batch that carries no comment`() {
        assertFalse(accepts(batch(comments = "")))
    }

    @Test
    fun `rejects a batch that carries more than 200 comments`() {
        assertFalse(accepts(batch(comments = List(BatchSchema.MAX_COMMENTS + 1) { comment() }.joinToString(","))))
    }

    @Test
    fun `rejects a comment text longer than 20000 characters`() {
        assertFalse(accepts(batch(comments = comment(text = "x".repeat(BatchSchema.MAX_TEXT + 1)))))
    }

    @Test
    fun `rejects a comment with no text`() {
        assertFalse(accepts(batch(comments = comment(text = ""))))
    }

    @Test
    fun `rejects a value that is not an object`() {
        assertFalse(accepts(""""a batch""""))
        assertFalse(accepts("null"))
    }

    @Test
    fun `names the field that broke the contract`() {
        val bad = BatchSchema.parse(batch(batchId = "b7f2a91/../etc")) as BatchParse.Bad

        assertEquals("batchId may hold letters, digits, underscores, and hyphens only", bad.reason)
    }
}
