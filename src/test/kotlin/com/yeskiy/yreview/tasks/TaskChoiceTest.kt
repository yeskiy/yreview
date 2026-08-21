package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
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

    @Test
    fun `a write takes the checked rows first`() {
        val target = TaskChoice.writeTarget(listOf(comment("x")), listOf(comment("y")))

        assertEquals(WriteScope.CHECKED, target.scope)
        assertEquals(listOf("x"), target.comments.map { it.id })
    }

    @Test
    fun `a write takes the highlighted rows when no check box is on`() {
        val target = TaskChoice.writeTarget(emptyList(), listOf(comment("y"), comment("z")))

        assertEquals(WriteScope.SELECTED, target.scope)
        assertEquals(listOf("y", "z"), target.comments.map { it.id })
    }

    @Test
    fun `a write never falls back to the whole tree`() {
        val target = TaskChoice.writeTarget(emptyList(), emptyList())

        assertEquals(WriteScope.NONE, target.scope)
        assertTrue(target.empty)
        assertTrue(target.comments.isEmpty())
        assertTrue(target.todos.isEmpty())
    }

    @Test
    fun `a write keeps the todo rows apart from the comments`() {
        val target = TaskChoice.writeTarget(emptyList(), listOf(task("a"), comment("y"), task("b")))

        assertEquals(listOf("y"), target.comments.map { it.id })
        assertEquals(listOf("a", "b"), target.todos.map { it.id })
    }

    @Test
    fun `a write of todo rows only holds no comment`() {
        val target = TaskChoice.writeTarget(emptyList(), listOf(task("a")))

        assertEquals(WriteScope.SELECTED, target.scope)
        assertFalse(target.empty)
        assertFalse(target.hasComments)
        assertEquals(listOf("a"), target.todos.map { it.id })
    }

    @Test
    fun `a write counts one comment once`() {
        val target = TaskChoice.writeTarget(listOf(comment("x"), comment("x")), emptyList())

        assertEquals(listOf("x"), target.comments.map { it.id })
    }

    @Test
    fun `the delete question names the risk and the count`() {
        val target = TaskChoice.writeTarget(listOf(comment("x"), comment("y")), emptyList())

        assertEquals(
            "You cannot put a review comment back. " +
                "The plugin removes 2 review comments from the git notes.",
            target.deleteQuestion,
        )
    }

    @Test
    fun `the delete question of todo rows only names the source`() {
        val target = TaskChoice.writeTarget(emptyList(), listOf(task("a")))

        assertEquals(
            "The plugin removes 1 TODO item from the source. One undo step puts the text back.",
            target.deleteQuestion,
        )
    }

    @Test
    fun `the delete question of a mixed selection names both counts`() {
        val target = TaskChoice.writeTarget(emptyList(), listOf(comment("y"), task("a"), task("b")))

        assertEquals(
            "You cannot put a review comment back. " +
                "The plugin removes 1 review comment from the git notes. " +
                "The plugin removes 2 TODO items from the source. One undo step puts the text back.",
            target.deleteQuestion,
        )
    }

    @Test
    fun `a resolve needs a review comment and a delete does not`() {
        val todosOnly = TaskChoice.writeTarget(emptyList(), listOf(task("a")))
        val nothing = TaskChoice.writeTarget(emptyList(), emptyList())

        assertFalse(todosOnly.hasComments)
        assertFalse(todosOnly.empty)
        assertFalse(nothing.hasComments)
        assertTrue(nothing.empty)
    }

    @Test
    fun `the notice names the todo rows a write leaves alone`() {
        val target = TaskChoice.writeTarget(emptyList(), listOf(comment("y"), task("a")))

        assertEquals(
            "A TODO lives in the source file and not in a note. The plugin kept 1 TODO row.",
            target.todoNotice,
        )
    }

    @Test
    fun `the notice stays empty when every row is a comment`() {
        assertEquals("", TaskChoice.writeTarget(listOf(comment("x")), emptyList()).todoNotice)
    }

    @Test
    fun `the preview takes the first row of the selection`() {
        assertEquals("b", TaskChoice.previewTask(listOf(task("b"), task("c")), all)?.id)
    }

    @Test
    fun `the preview takes the first row of the tree when no row is selected`() {
        assertEquals("a", TaskChoice.previewTask(emptyList(), all)?.id)
    }

    @Test
    fun `the preview stays empty when the tree is empty`() {
        assertNull(TaskChoice.previewTask(emptyList(), emptyList()))
    }
}
