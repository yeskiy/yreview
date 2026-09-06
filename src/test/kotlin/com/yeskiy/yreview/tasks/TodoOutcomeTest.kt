package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What one batch of reported TODO identifiers proves.
 *
 * A TODO leaves no record behind, so the plugin cannot read a closed TODO anywhere. It can
 * read two other facts. The scan says whether the line is still in the source, and the task
 * file of this project window says whether the identifier ever left this window.
 */
class TodoOutcomeTest {

    private val todo = TaskIds.forTodo("src/Main.kt", 12)

    private val handle = TaskHandles.of(todo)

    private val other = TaskIds.forTodo("src/Other.kt", 40)

    @Test
    fun `an identifier this window handed out and no longer finds closed`() {
        val outcome = TodoOutcome.of(listOf(todo), open = emptyList(), sent = setOf(handle))

        assertEquals(listOf(todo), outcome.closed)
        assertEquals(emptyList(), outcome.stillOpen)
    }

    @Test
    fun `an identifier whose line is still in the source closed nothing`() {
        val outcome = TodoOutcome.of(listOf(todo), open = listOf(todo), sent = setOf(handle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(listOf(todo), outcome.stillOpen)
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
    fun `an empty batch reads nothing`() {
        val outcome = TodoOutcome.of(emptyList(), open = listOf(todo), sent = setOf(handle))

        assertEquals(emptyList(), outcome.closed)
        assertEquals(emptyList(), outcome.stillOpen)
    }
}
