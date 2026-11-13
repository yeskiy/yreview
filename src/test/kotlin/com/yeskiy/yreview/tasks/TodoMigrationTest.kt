package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

/** Moves the TODO identifiers of an older task file to the current form, once. */
class TodoMigrationTest {

    private val root = "E:/repo"

    private fun task(id: String, line: Int, text: String = "TODO: drop this", kind: TaskKind = TaskKind.TODO) = ReviewTask(
        id = id,
        kind = kind,
        path = "src/Main.kt",
        startLine = line,
        endLine = line,
        text = text,
        rootPath = root,
    )

    private fun document(version: Int, tasks: List<ReviewTask>) = TaskDocument(
        version = version,
        repository = root,
        commit = "44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900",
        generated = "2026-09-06T02:40:00Z",
        tasks = tasks,
    )

    private val current = TaskIds.forTodo("", "src/Main.kt", "TODO: drop this", 0)

    private val open = listOf(task(current, 12))

    @Test
    fun `maps an older long identifier to the identifier of the item at that line`() {
        val old = document(1, listOf(task(TaskIds.legacyTodo("src/Main.kt", 12), 12)))

        val moved = TodoMigration.migrate(old, open)

        assertEquals(TodoMigration.VERSION, moved.version)
        assertEquals(listOf(current), moved.tasks.map { it.id })
    }

    @Test
    fun `maps an older handle to the handle of the item at that line`() {
        val old = document(1, listOf(task(TaskHandles.of(TaskIds.legacyTodo("src/Main.kt", 12)), 12)))

        assertEquals(listOf(TaskHandles.of(current)), TodoMigration.migrate(old, open).tasks.map { it.id })
    }

    @Test
    fun `keeps an entry when no todo item sits at the old place`() {
        val entry = task(TaskIds.legacyTodo("src/Main.kt", 30), 30)

        assertEquals(listOf(entry), TodoMigration.migrate(document(1, listOf(entry)), open).tasks)
    }

    @Test
    fun `picks the item with the same text when two items share the old line`() {
        val twin = TaskIds.forTodo("", "src/Main.kt", "TODO: other", 0)
        val old = document(1, listOf(task(TaskIds.legacyTodo("src/Main.kt", 12), 12)))

        val moved = TodoMigration.migrate(old, listOf(task(twin, 12, "TODO: other"), task(current, 12)))

        assertEquals(listOf(current), moved.tasks.map { it.id })
    }

    @Test
    fun `keeps a comment and an item of another repository`() {
        val comment = task("c3f9a12aabbccddeeff00112233445566778899a", 12, kind = TaskKind.COMMENT)
        val elsewhere = listOf(task(current, 12).copy(rootPath = "E:/other"))
        val old = document(1, listOf(comment, task(TaskIds.legacyTodo("src/Main.kt", 12), 12)))

        assertEquals(old.tasks, TodoMigration.migrate(old, elsewhere).tasks)
    }

    @Test
    fun `a second run changes nothing`() {
        val once = TodoMigration.migrate(document(1, listOf(task(TaskIds.legacyTodo("src/Main.kt", 12), 12))), open)

        assertSame(once, TodoMigration.migrate(once, listOf(task("todo-${"a".repeat(40)}-0", 12))))
    }
}
