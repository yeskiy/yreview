package com.yeskiy.yreview.channel

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MetaTest {

    private val batch = ReviewBatch(
        batchId = "b7f2a91",
        branch = "feat/channel-server",
        commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments = listOf(
            ReviewComment("aaaaaaa1", "a.kt", startLine = 1, endLine = 1, revision = "HEAD", text = "one"),
            ReviewComment("bbbbbbb2", "b.kt", startLine = 2, endLine = 2, revision = "HEAD", text = "two"),
        ),
    )

    @Test
    fun `carries the branch, the commit, the count, and the batch id`() {
        assertEquals(
            mapOf(
                "branch" to "feat/channel-server",
                "commit" to "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
                "count" to "2",
                "batch_id" to "b7f2a91",
            ),
            Format.batchMeta(batch),
        )
    }

    @Test
    fun `uses only keys that Claude Code keeps`() {
        Format.batchMeta(batch).keys.forEach { assertTrue(Regex("^[A-Za-z0-9_]+$").matches(it), it) }
    }

    @Test
    fun `keeps a key of letters, digits, and underscores`() {
        assertEquals(
            mapOf("batch_id" to "b1", "count7" to "3"),
            Format.sanitizeMeta(mapOf("batch_id" to "b1", "count7" to "3")),
        )
    }

    @Test
    fun `drops a key that holds a hyphen`() {
        assertEquals(mapOf("count" to "3"), Format.sanitizeMeta(mapOf("batch-id" to "b1", "count" to "3")))
    }

    @Test
    fun `drops a key that holds a dot or a slash`() {
        assertEquals(
            mapOf("ok" to "3"),
            Format.sanitizeMeta(mapOf("a.b" to "1", "c/d" to "2", "ok" to "3")),
        )
    }

    @Test
    fun `drops an empty key`() {
        assertEquals(mapOf("ok" to "2"), Format.sanitizeMeta(mapOf("" to "1", "ok" to "2")))
    }

    @Test
    fun `drops an entry whose value is empty`() {
        assertEquals(mapOf("ok" to "2"), Format.sanitizeMeta(mapOf("branch" to "", "ok" to "2")))
    }

    @Test
    fun `drops an entry whose value is not a string`() {
        assertEquals(mapOf("ok" to "2"), Format.sanitizeMeta(mapOf("count" to 3, "ok" to "2")))
    }

    @Test
    fun `removes a double quote from a value so the tag attribute stays whole`() {
        assertEquals(
            mapOf("branch" to "fix/quoted-name"),
            Format.sanitizeMeta(mapOf("branch" to "fix/\"quoted\"-name")),
        )
    }

    @Test
    fun `removes a control character from a value`() {
        assertEquals(mapOf("branch" to "onetwotab"), Format.sanitizeMeta(mapOf("branch" to "one\ntwo\ttab")))
    }

    @Test
    fun `drops an entry whose value holds only characters that get removed`() {
        assertEquals(mapOf("ok" to "2"), Format.sanitizeMeta(mapOf("branch" to "\"\"\"", "ok" to "2")))
    }
}
