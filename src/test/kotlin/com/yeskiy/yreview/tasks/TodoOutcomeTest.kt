package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What one batch of reported TODO identifiers proves.
 *
 * A TODO leaves no record behind, so the plugin cannot read a closed TODO anywhere. It can
 * read two other facts. The scan says whether the line is still in the source, and the task
 * file of this project window says whether the identifier ever left this window.
 */
class TodoOutcomeTest {

    private fun open(id: String, path: String = "src/Main.kt", line: Int = 12) = ReviewTask(
        id = id,
        kind = TaskKind.TODO,
        path = path,
        startLine = line,
        endLine = line,
        text = "TODO: drop this",
    )

    private val todo = TaskIds.forTodo("", "src/Main.kt", "TODO: drop this", 0)

    private val handle = TaskHandles.of(todo)

    private val other = TaskIds.forTodo("", "src/Other.kt", "TODO: drop this", 0)

    /** Two TODO lines that carry the same key and the same number, so one handle names both. */
    private val twin = "${TaskIds.TODO_PREFIX}c3f9a12a${"0".repeat(32)}-0"

    private val otherTwin = "${TaskIds.TODO_PREFIX}c3f9a12a${"f".repeat(32)}-0"

    private val twinHandle = TaskHandles.of(twin)

    @Test
    fun `an identifier this window handed out and no longer finds closed`() {
        val outcome = TodoOutcome.of(listOf(todo), open = emptyList(), sent = setOf(handle))

        assertEquals(listOf(todo), outcome.closed)
        assertEquals(emptyList(), outcome.stillOpen)
    }

    @Test
    fun `an identifier whose line is still in the source closed nothing`() {
        val outcome = TodoOutcome.of(listOf(todo), open = listOf(open(todo)), sent = setOf(handle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(listOf(todo), outcome.stillOpen)
    }

    @Test
    fun `new lines above a todo item keep it open`() {
        // The window sent the item at line 12. Three imports then moved it to line 15.
        val outcome = TodoOutcome.of(listOf(handle), open = listOf(open(todo, line = 15)), sent = setOf(handle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(listOf(handle), outcome.stillOpen)
    }

    @Test
    fun `an identifier this window never handed out counts nothing and says nothing`() {
        // One done file serves every window of one repository. A window that never sent
        // this task cannot say whether the line went, so it reports neither way.
        val outcome = TodoOutcome.of(listOf(other), open = emptyList(), sent = setOf(handle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(emptyList(), outcome.stillOpen)
    }

    @Test
    fun `the short handle and the long identifier name the same task`() {
        // The task file holds the handle, and an agent reports either form.
        assertEquals(listOf(handle), TodoOutcome.of(listOf(handle), emptyList(), setOf(handle)).closed)
        assertEquals(listOf(todo), TodoOutcome.of(listOf(todo), emptyList(), setOf(handle)).closed)
    }

    @Test
    fun `a value of an older build names the item that is still at its path and line`() {
        val legacy = TaskHandles.of(TaskIds.legacyTodo("src/Main.kt", 12))
        val outcome = TodoOutcome.of(listOf(legacy), open = listOf(open(todo)), sent = setOf(legacy))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(listOf(legacy), outcome.stillOpen)
    }

    @Test
    fun `a value of an older build whose line went closed`() {
        val legacy = TaskIds.legacyTodo("src/Main.kt", 12)
        val outcome = TodoOutcome.of(listOf(legacy), open = emptyList(), sent = setOf(TaskHandles.of(legacy)))

        assertEquals(listOf(legacy), outcome.closed)
    }

    @Test
    fun `a handle that names two tasks closes nothing`() {
        val outcome = TodoOutcome.of(listOf(twinHandle), open = listOf(open(twin), open(otherTwin)), sent = setOf(twinHandle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(emptyList(), outcome.stillOpen)
    }

    @Test
    fun `a handle that names two tasks tells the agent what a comment id tells it`() {
        val outcome = TodoOutcome.of(listOf(twinHandle), open = listOf(open(twin), open(otherTwin)), sent = setOf(twinHandle))

        assertEquals(listOf(TaskCompletion.ambiguous(twinHandle, 2)), outcome.problems)
        assertTrue(outcome.problems.single().contains(TaskCompletion.AMBIGUOUS))
    }

    @Test
    fun `an empty batch reads nothing`() {
        val outcome = TodoOutcome.of(emptyList(), open = listOf(open(todo)), sent = setOf(handle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(emptyList(), outcome.stillOpen)
    }
}
