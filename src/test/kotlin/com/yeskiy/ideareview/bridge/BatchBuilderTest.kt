package com.yeskiy.ideareview.bridge

import com.yeskiy.ideareview.store.Comment
import com.yeskiy.ideareview.store.Location
import com.yeskiy.ideareview.store.NoteRefs
import com.yeskiy.ideareview.store.Range
import com.yeskiy.ideareview.store.StoredComment
import com.yeskiy.ideareview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BatchBuilderTest {

    private val commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6"

    private fun stored(
        text: String? = "Add the guard before the loop.",
        path: String = "src/main/kotlin/Parser.kt",
        startLine: Int = 88,
        endLine: Int = 94,
        revision: String = commit,
        location: Boolean = true,
    ): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = "test@example.com",
            description = text,
            location = if (location) Location(revision, path, Range(startLine, endLine = endLine)) else null,
        )
        return StoredComment(comment.id(), NoteRefs.LOCAL, comment)
    }

    private fun builder(): BatchBuilder {
        val counter = java.util.concurrent.atomic.AtomicInteger()
        return BatchBuilder { "b${counter.incrementAndGet()}" }
    }

    @Test
    fun `carries one comment into one batch`() {
        val batches = builder().build("main", commit, listOf(stored()))
        val batch = batches.single()
        assertEquals("b1", batch.batchId)
        assertEquals("main", batch.branch)
        assertEquals(commit, batch.commit)
        val comment = batch.comments.single()
        assertEquals("src/main/kotlin/Parser.kt", comment.path)
        assertEquals(88, comment.startLine)
        assertEquals(94, comment.endLine)
        assertEquals(commit, comment.revision)
        assertEquals("Add the guard before the loop.", comment.text)
    }

    @Test
    fun `writes only the fields the contract names`() {
        val one = stored()
        val json = BatchJson.encode(builder().build("main", commit, listOf(one)).single())
        assertEquals(
            """{"batchId":"b1","branch":"main","commit":"$commit","comments":[""" +
                """{"id":"${one.id}","path":"src/main/kotlin/Parser.kt","startLine":88,"endLine":94,""" +
                """"revision":"$commit","text":"Add the guard before the loop."}]}""",
            json,
        )
    }

    @Test
    fun `writes a text that holds a line break as one line of JSON`() {
        val json = BatchJson.encode(builder().build("main", commit, listOf(stored("first\nsecond"))).single())
        assertFalse(json.contains('\n'), "the event carries one batch on one line")
        assertTrue(json.contains("""first\nsecond"""))
    }

    @Test
    fun `leaves out a comment that has no location`() {
        assertTrue(builder().build("main", commit, listOf(stored(location = false))).isEmpty())
    }

    @Test
    fun `leaves out a comment that has no text`() {
        assertTrue(builder().build("main", commit, listOf(stored(text = "   "))).isEmpty())
    }

    @Test
    fun `leaves out a comment whose revision is not a revision`() {
        assertTrue(builder().build("main", commit, listOf(stored(revision = "; rm -rf /"))).isEmpty())
    }

    @Test
    fun `leaves out a comment whose path holds a control character`() {
        assertTrue(builder().build("main", commit, listOf(stored(path = "a" + Char(1) + "b.kt"))).isEmpty())
    }

    @Test
    fun `cuts a text that is longer than the contract allows`() {
        val batch = builder().build("main", commit, listOf(stored("x".repeat(30_000)))).single()
        assertEquals(20_000, batch.comments.single().text.length)
    }

    @Test
    fun `keeps every line number inside the range the contract allows`() {
        val batch = builder().build("main", commit, listOf(stored(startLine = -4, endLine = 20_000_000))).single()
        assertEquals(0, batch.comments.single().startLine)
        assertEquals(10_000_000, batch.comments.single().endLine)
    }

    @Test
    fun `splits more comments than one batch may hold`() {
        val many = (1..201).map { stored("comment $it") }
        val batches = builder().build("main", commit, many)
        assertEquals(listOf(200, 1), batches.map { it.comments.size })
        assertEquals(listOf("b1", "b2"), batches.map { it.batchId })
    }

    @Test
    fun `sends nothing when the commit is not a revision`() {
        assertTrue(builder().build("main", "not a commit", listOf(stored())).isEmpty())
    }

    @Test
    fun `names the branch HEAD when the repository has no branch`() {
        assertEquals("main", builder().build("ma" + Char(7) + "in", commit, listOf(stored())).single().branch)
    }

    @Test
    fun `drops a control character from the branch name`() {
        assertEquals("main", builder().build("ma" + Char(7) + "in", commit, listOf(stored())).single().branch)
    }

    @Test
    fun `makes a batch id the contract accepts`() {
        assertTrue(Regex("^[A-Za-z0-9_-]{1,200}$").matches(BatchBuilder().build("main", commit, listOf(stored())).single().batchId))
    }
}
