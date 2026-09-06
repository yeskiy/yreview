package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class ReviewTaskTest {

    private val comment = ReviewTask(
        id = "9f1c2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b",
        kind = TaskKind.COMMENT,
        path = "src/main/kotlin/Parser.kt",
        startLine = 53,
        endLine = 69,
        text = "This reload reads git on the user interface thread.",
        author = "reviewer@example.com",
        filePath = "E:/repo/src/main/kotlin/Parser.kt",
        rootPath = "E:/repo",
        revision = "0f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
        state = "local",
    )

    private val todo = ReviewTask(
        id = TaskIds.forTodo("src/main/kotlin/Parser.kt", 88),
        kind = TaskKind.TODO,
        path = "src/main/kotlin/Parser.kt",
        startLine = 88,
        endLine = 88,
        text = "TODO: drop this once the anchor repair lands",
        pattern = "TODO",
    )

    @Test
    fun `makes an identifier the channel accepts`() {
        assertTrue(TaskIds.isSafe(todo.id), todo.id)
    }

    @Test
    fun `gives a new identifier when the line moves`() {
        assertNotEquals(TaskIds.forTodo("a/B.kt", 12), TaskIds.forTodo("a/B.kt", 13))
    }

    @Test
    fun `gives the same identifier for the same line`() {
        assertEquals(TaskIds.forTodo("a/B.kt", 12), TaskIds.forTodo("a/B.kt", 12))
    }

    @Test
    fun `gives a new identifier when the file changes`() {
        assertNotEquals(TaskIds.forTodo("a/B.kt", 12), TaskIds.forTodo("a/C.kt", 12))
    }

    @Test
    fun `knows an identifier the plugin made`() {
        assertTrue(TaskIds.isKnown(todo.id), todo.id)
        assertTrue(TaskIds.isKnown(comment.id), comment.id)
    }

    @Test
    fun `refuses an identifier the plugin never made`() {
        assertFalse(TaskIds.isKnown("--upload-pack"))
        assertFalse(TaskIds.isKnown("../../etc/passwd"))
        assertFalse(TaskIds.isKnown("todo-0123456789abcdef0123456789abcdef01234567"))
        assertFalse(TaskIds.isKnown(comment.id.uppercase()))
    }

    @Test
    fun `knows a todo identifier`() {
        assertTrue(TaskIds.isTodo(todo.id))
        assertFalse(TaskIds.isTodo(comment.id))
    }

    @Test
    fun `refuses an identifier that holds a character the channel bans`() {
        assertFalse(TaskIds.isSafe("todo:src%2FA.kt:88"))
        assertFalse(TaskIds.isSafe(""))
        assertFalse(TaskIds.isSafe("a b"))
        assertFalse(TaskIds.isSafe("a".repeat(201)))
    }

    @Test
    fun `knows a handle`() {
        assertTrue(TaskIds.isHandle("yd8pmsq91"))
        assertTrue(TaskIds.isKnown("yd8pmsq91"))
    }

    @Test
    fun `a handle is never a value of the store`() {
        assertFalse(TaskIds.isLong("yd8pmsq91"))
        assertFalse(TaskIds.isTodo("yd8pmsq91"))
    }

    @Test
    fun `a value of the store is never a handle`() {
        assertFalse(TaskIds.isHandle(comment.id))
        assertFalse(TaskIds.isHandle(todo.id))
        assertTrue(TaskIds.isLong(comment.id))
        assertTrue(TaskIds.isLong(todo.id))
    }

    @Test
    fun `refuses a short value that carries no prefix`() {
        assertFalse(TaskIds.isHandle("d8pmsq91"))
        assertFalse(TaskIds.isKnown("d8pmsq91"))
    }

    @Test
    fun `refuses a handle that holds a character the rule bans`() {
        assertFalse(TaskIds.isHandle("yD8PMSQ91"))
        assertFalse(TaskIds.isHandle("y-d8pmsq91"))
        assertFalse(TaskIds.isHandle("y"))
        assertFalse(TaskIds.isHandle("y" + "a".repeat(33)))
    }

    @Test
    fun `a handle the channel refuses is never made`() {
        assertTrue(TaskIds.isSafe("yd8pmsq91"))
    }

    @Test
    fun `writes the fields of a comment task`() {
        val text = TaskJson.encode(document(listOf(comment)))
        assertTrue(text.contains(""""kind": "comment""""), text)
        assertTrue(text.contains(""""author": "reviewer@example.com""""), text)
        assertTrue(text.contains(""""startLine": 53"""), text)
    }

    @Test
    fun `writes the fields of a todo task`() {
        val text = TaskJson.encode(document(listOf(todo)))
        assertTrue(text.contains(""""kind": "todo""""), text)
        assertTrue(text.contains(""""pattern": "TODO""""), text)
    }

    @Test
    fun `keeps the file path and the revision out of the file`() {
        val text = TaskJson.encode(document(listOf(comment)))
        assertFalse(text.contains("filePath"), text)
        assertFalse(text.contains("rootPath"), text)
        assertFalse(text.contains("0f1e2d3c4b5a69788796a5b4c3d2e1f009182736"), text)
    }

    @Test
    fun `leaves out a field that has no value`() {
        assertFalse(TaskJson.encode(document(listOf(todo))).contains("author"))
    }

    @Test
    fun `writes the head of the document`() {
        val text = TaskJson.encode(document(listOf(comment)))
        assertTrue(text.contains(""""version": 1"""), text)
        assertTrue(text.contains(""""repository": "E:/repo""""), text)
        assertTrue(text.contains(""""generated": "2026-08-21T02:40:00Z""""), text)
    }

    @Test
    fun `reads back what it wrote`() {
        val back = TaskJson.decode(TaskJson.encode(document(listOf(comment, todo))))
        assertEquals(listOf(comment.id, todo.id), back.tasks.map { it.id })
        assertEquals(TaskKind.COMMENT, back.tasks.first().kind)
        assertEquals("", back.tasks.first().filePath)
    }

    private fun document(tasks: List<ReviewTask>) = TaskDocument(
        repository = "E:/repo",
        commit = "44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900",
        generated = "2026-08-21T02:40:00Z",
        tasks = tasks,
    )
}
