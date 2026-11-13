package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** The identifiers of the TODO items of one file. */
class TodoIdsTest {

    private fun item(text: String, line: Int, path: String = "src/Main.kt") = ReviewTask(
        id = "",
        kind = TaskKind.TODO,
        path = path,
        startLine = line,
        endLine = line,
        text = text,
        filePath = "E:/repo/$path",
        rootPath = "E:/repo",
    )

    @Test
    fun `two todo items on one line get two identifiers`() {
        val ids = TodoIds.assign("", listOf(item("TODO: a", 4), item("TODO: b", 4))).map { it.id }

        assertEquals(2, ids.distinct().size, ids.toString())
    }

    @Test
    fun `two equal todo items on one line get two identifiers`() {
        val ids = TodoIds.assign("", listOf(item("TODO: a", 4), item("TODO: a", 4))).map { it.id }

        assertEquals(listOf(TaskIds.forTodo("", "src/Main.kt", "TODO: a", 0), TaskIds.forTodo("", "src/Main.kt", "TODO: a", 1)), ids)
    }

    @Test
    fun `the same path in two repositories gets two identifiers`() {
        val lib = TodoIds.assign(TodoIds.repositoryOf("E:/work", "E:/work/lib"), listOf(item("TODO: a", 4))).single()
        val app = TodoIds.assign(TodoIds.repositoryOf("E:/work", "E:/work/app"), listOf(item("TODO: a", 4))).single()

        assertNotEquals(lib.id, app.id)
    }

    @Test
    fun `new lines above a todo item keep its identifier and its check`() {
        val before = TodoIds.assign("", listOf(item("TODO: a", 4), item("TODO: b", 9)))
        val after = TodoIds.assign("", listOf(item("TODO: a", 7), item("TODO: b", 12)))
        val checks = TaskChecks().apply { set(listOf(before[1]), true) }

        assertEquals(before.map { it.id }, after.map { it.id })
        assertTrue(checks.isChecked(after[1]))
    }

    @Test
    fun `the repository of a root names its place inside the project`() {
        assertEquals("", TodoIds.repositoryOf("E:/work", "E:/work"))
        assertEquals("lib", TodoIds.repositoryOf("E:/work", "E:/work/lib"))
        assertEquals("E:/workshop", TodoIds.repositoryOf("E:/work", "E:/workshop"))
        assertEquals("E:/work", TodoIds.repositoryOf(null, "E:/work"))
    }
}
