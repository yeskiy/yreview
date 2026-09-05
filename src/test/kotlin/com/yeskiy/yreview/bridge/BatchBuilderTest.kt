package com.yeskiy.yreview.bridge

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BatchBuilderTest {

    private val escape = Char(27)

    private val commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6"

    private fun task(
        text: String = "Add the guard before the loop.",
        path: String = "src/main/kotlin/Parser.kt",
        startLine: Int = 88,
        endLine: Int = 94,
        revision: String = commit,
        id: String = "a1b2c3d4e5",
    ): ReviewTask = ReviewTask(
        id = id,
        kind = TaskKind.COMMENT,
        path = path,
        startLine = startLine,
        endLine = endLine,
        text = text,
        revision = revision,
    )

    private fun builder(): BatchBuilder {
        val counter = java.util.concurrent.atomic.AtomicInteger()
        return BatchBuilder { "b${counter.incrementAndGet()}" }
    }

    @Test
    fun `carries one comment into one batch`() {
        val batch = builder().build("main", commit, listOf(task())).batches.single()
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
        val json = BatchJson.encode(builder().build("main", commit, listOf(task())).batches.single())
        assertEquals(
            """{"batchId":"b1","branch":"main","commit":"$commit","comments":[""" +
                """{"id":"a1b2c3d4e5","path":"src/main/kotlin/Parser.kt","startLine":88,"endLine":94,""" +
                """"revision":"$commit","text":"Add the guard before the loop."}]}""",
            json,
        )
    }

    @Test
    fun `writes a text that holds a line break as one line of JSON`() {
        val json = BatchJson.encode(builder().build("main", commit, listOf(task("first\nsecond"))).batches.single())
        assertFalse(json.contains('\n'), "the event carries one batch on one line")
        assertTrue(json.contains("""first\nsecond"""))
    }

    @Test
    fun `leaves out a task that has no revision`() {
        val plan = builder().build("main", commit, listOf(task(revision = "")))
        assertTrue(plan.batches.isEmpty())
        assertEquals(BatchBuilder.REVISION_REASON, plan.reason)
    }

    @Test
    fun `leaves out a task that has no text`() {
        val plan = builder().build("main", commit, listOf(task(text = "   ")))
        assertTrue(plan.batches.isEmpty())
        assertEquals(BatchBuilder.TEXT_REASON, plan.reason)
    }

    @Test
    fun `leaves out a task whose revision is not a revision`() {
        val plan = builder().build("main", commit, listOf(task(revision = "; rm -rf /")))
        assertTrue(plan.batches.isEmpty())
        assertEquals(BatchBuilder.REVISION_REASON, plan.reason)
    }

    @Test
    fun `leaves out a task whose path holds a control character`() {
        val plan = builder().build("main", commit, listOf(task(path = "a" + Char(1) + "b.kt")))
        assertTrue(plan.batches.isEmpty())
        assertEquals(BatchBuilder.PATH_REASON, plan.reason)
    }

    @Test
    fun `leaves out a task whose identifier breaks the channel rule`() {
        val plan = builder().build("main", commit, listOf(task(id = "todo:src%2FA.kt:88")))
        assertTrue(plan.batches.isEmpty())
        assertEquals(BatchBuilder.ID_REASON, plan.reason)
    }

    @Test
    fun `names every task it dropped`() {
        val plan = builder().build("main", commit, listOf(task(id = "a b"), task(text = " ", id = "c1")))
        assertEquals(listOf("a b", "c1"), plan.dropped.map { it.id })
        assertEquals(2, plan.dropped.size)
    }

    @Test
    fun `keeps the good tasks when one task is bad`() {
        val plan = builder().build("main", commit, listOf(task(id = "a b"), task(id = "good1")))
        assertEquals(listOf("good1"), plan.batches.single().comments.map { it.id })
        assertEquals(1, plan.dropped.size)
        assertEquals(1, plan.tasks)
    }

    @Test
    fun `names both reasons when two rules break`() {
        val plan = builder().build("main", commit, listOf(task(id = "a b"), task(text = " ", id = "c1")))
        assertEquals("${BatchBuilder.ID_REASON} and ${BatchBuilder.TEXT_REASON}", plan.reason)
    }

    @Test
    fun `cuts a text that is longer than the contract allows`() {
        val batch = builder().build("main", commit, listOf(task("x".repeat(30_000)))).batches.single()
        assertEquals(20_000, batch.comments.single().text.length)
    }

    @Test
    fun `keeps every line number inside the range the contract allows`() {
        val plan = builder().build("main", commit, listOf(task(startLine = -4, endLine = 20_000_000)))
        assertEquals(0, plan.batches.single().comments.single().startLine)
        assertEquals(10_000_000, plan.batches.single().comments.single().endLine)
    }

    @Test
    fun `splits more comments than one batch may hold`() {
        val many = (1..201).map { task("comment $it", id = "id$it") }
        val plan = builder().build("main", commit, many)
        assertEquals(listOf(200, 1), plan.batches.map { it.comments.size })
        assertEquals(listOf("b1", "b2"), plan.batches.map { it.batchId })
    }

    @Test
    fun `sends nothing when the commit is not a revision`() {
        val plan = builder().build("main", "not a commit", listOf(task()))
        assertTrue(plan.batches.isEmpty())
        assertEquals(BatchBuilder.COMMIT_REASON, plan.reason)
    }

    @Test
    fun `names the branch HEAD when the repository has no branch`() {
        assertEquals("HEAD", builder().build("", commit, listOf(task())).batches.single().branch)
    }

    @Test
    fun `drops a control character from the branch name`() {
        assertEquals("main", builder().build("ma" + Char(7) + "in", commit, listOf(task())).batches.single().branch)
    }

    @Test
    fun `makes a batch id the contract accepts`() {
        val batch = BatchBuilder().build("main", commit, listOf(task())).batches.single()
        assertTrue(Regex("^[A-Za-z0-9_-]{1,200}$").matches(batch.batchId))
    }

    @Test
    fun `the batch carries no escape sequence`() {
        val text = builder()
            .build("main", commit, listOf(task(text = "red" + escape + "[31m alert")))
            .batches.single().comments.single().text

        assertFalse(text.contains(escape), text)
        assertEquals("red[31m alert", text)
    }
}
