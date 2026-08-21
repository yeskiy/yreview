package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TaskChoiceTest {

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

    private val all = listOf(task("a"), task("b"), task("c"))

    @Test
    fun `sends the checked tasks first`() {
        val target = TaskChoice.sendTarget(listOf(task("a")), listOf(task("b")), all)

        assertEquals(SendScope.CHECKED, target.scope)
        assertEquals(listOf("a"), target.tasks.map { it.id })
        assertEquals("Send Checked (1)", target.text)
        assertEquals("Send the 1 checked task to the agent.", target.description)
    }

    @Test
    fun `sends the highlighted rows when no check box is on`() {
        val target = TaskChoice.sendTarget(emptyList(), listOf(task("b"), task("c")), all)

        assertEquals(SendScope.SELECTED, target.scope)
        assertEquals("Send Selected (2)", target.text)
        assertEquals("Send the 2 selected rows to the agent.", target.description)
    }

    @Test
    fun `names the whole tree when the user chose nothing`() {
        val target = TaskChoice.sendTarget(emptyList(), emptyList(), all)

        assertEquals(SendScope.ALL, target.scope)
        assertEquals(listOf("a", "b", "c"), target.tasks.map { it.id })
        assertEquals("Send All (3)", target.text)
        assertEquals("No row is checked, so the whole tree goes out. It holds 3 tasks.", target.description)
    }

    @Test
    fun `sends nothing from an empty tree`() {
        val target = TaskChoice.sendTarget(emptyList(), emptyList(), emptyList())

        assertEquals(SendScope.NONE, target.scope)
        assertTrue(target.tasks.isEmpty())
        assertEquals("Send to the Agent", target.text)
    }

    @Test
    fun `walks to the first row when no row is selected`() {
        assertEquals(0, TaskChoice.nextIndex(3, -1))
    }

    @Test
    fun `walks to the next row and stops at the last one`() {
        assertEquals(2, TaskChoice.nextIndex(3, 1))
        assertEquals(-1, TaskChoice.nextIndex(3, 2))
    }

    @Test
    fun `walks to the previous row and stops at the first one`() {
        assertEquals(0, TaskChoice.previousIndex(3, 1))
        assertEquals(-1, TaskChoice.previousIndex(3, 0))
    }

    @Test
    fun `walks to the last row when no row is selected`() {
        assertEquals(2, TaskChoice.previousIndex(3, -1))
    }

    @Test
    fun `walks nowhere in an empty tree`() {
        assertEquals(-1, TaskChoice.nextIndex(0, -1))
        assertEquals(-1, TaskChoice.previousIndex(0, -1))
    }
}
