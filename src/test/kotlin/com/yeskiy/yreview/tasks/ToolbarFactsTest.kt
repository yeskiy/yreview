package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ToolbarFactsTest {

    private fun task(id: String) = ReviewTask(
        id = id,
        kind = TaskKind.TODO,
        path = "src/A.kt",
        startLine = 1,
        endLine = 1,
        text = "work on $id",
        filePath = "/repo/src/A.kt",
        rootPath = "/repo",
    )

    private fun comment(id: String) = ReviewTask(
        id = id,
        kind = TaskKind.COMMENT,
        path = "src/A.kt",
        startLine = 1,
        endLine = 1,
        text = "please look at $id",
        filePath = "/repo/src/A.kt",
        rootPath = "/repo",
    )

    private val all = listOf(task("a"), comment("b"), task("c"))

    private fun facts(
        selected: List<ReviewTask> = emptyList(),
        checked: List<ReviewTask> = emptyList(),
        checkCount: Int = checked.size,
        rows: List<ReviewTask> = all,
    ) = ToolbarFacts.of(rows, selected, checked, checkCount)

    @Test
    fun `sends the checked rows before the highlighted rows`() {
        val found = facts(selected = listOf(task("c")), checked = listOf(task("a")))

        assertEquals(SendScope.CHECKED, found.send.scope)
        assertEquals(listOf("a"), found.send.tasks.map { it.id })
        assertEquals("Send Checked (1)", found.send.text)
        assertEquals("Copy Checked (1)", found.send.copyText)
    }

    @Test
    fun `sends the highlighted rows when no check box is on`() {
        val found = facts(selected = listOf(task("c")))

        assertEquals(SendScope.SELECTED, found.send.scope)
        assertEquals("Send Selected (1)", found.send.text)
    }

    @Test
    fun `sends the whole tree when the user chose nothing`() {
        val found = facts()

        assertEquals(SendScope.ALL, found.send.scope)
        assertEquals(listOf("a", "b", "c"), found.send.tasks.map { it.id })
    }

    @Test
    fun `keeps a write away from the whole tree`() {
        val found = facts()

        assertEquals(WriteScope.NONE, found.write.scope)
        assertTrue(found.write.empty)
        assertFalse(found.write.hasComments)
    }

    @Test
    fun `splits a write by kind`() {
        val found = facts(checked = listOf(task("a"), comment("b")))

        assertEquals(WriteScope.CHECKED, found.write.scope)
        assertEquals(listOf("b"), found.write.comments.map { it.id })
        assertEquals(listOf("a"), found.write.todos.map { it.id })
        assertTrue(found.write.hasComments)
        assertFalse(found.write.empty)
    }

    @Test
    fun `names an empty tree`() {
        val found = facts(rows = emptyList())

        assertFalse(found.anyTask)
        assertEquals(SendScope.NONE, found.send.scope)
        assertEquals("Send to the Agent", found.send.text)
    }

    @Test
    fun `names a tree that holds a task`() {
        assertTrue(facts().anyTask)
    }

    @Test
    fun `counts a check box of a row that a filter hides`() {
        val found = facts(rows = listOf(task("a")), checkCount = 2)

        assertTrue(found.anyCheck)
    }

    @Test
    fun `clears the check count when no box is on`() {
        assertFalse(facts().anyCheck)
    }

    @Test
    fun `disables every button of a toolbar that reaches no tree`() {
        assertFalse(ToolbarFacts.EMPTY.anyTask)
        assertFalse(ToolbarFacts.EMPTY.anyCheck)
        assertEquals(SendScope.NONE, ToolbarFacts.EMPTY.send.scope)
        assertEquals(WriteScope.NONE, ToolbarFacts.EMPTY.write.scope)
        assertTrue(ToolbarFacts.EMPTY.write.empty)
        assertFalse(ToolbarFacts.EMPTY.write.hasComments)
    }
}
