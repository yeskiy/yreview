package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TaskChecksTest {

    private fun task(id: String, path: String = "src/A.kt", root: String = "/repo") = ReviewTask(
        id = id,
        kind = TaskKind.TODO,
        path = path,
        startLine = 1,
        endLine = 1,
        text = "work on $id",
        filePath = "$root/$path",
        rootPath = root,
    )

    private val first = task("a")

    private val second = task("b")

    @Test
    fun `checks no task at the start`() {
        val checks = TaskChecks()

        assertEquals(0, checks.size)
        assertFalse(checks.isChecked(first))
        assertEquals(CheckState.NONE, checks.state(listOf(first, second)))
    }

    @Test
    fun `checks one task`() {
        val checks = TaskChecks()

        checks.set(listOf(first), true)

        assertTrue(checks.isChecked(first))
        assertFalse(checks.isChecked(second))
        assertEquals(listOf("a"), checks.checkedOf(listOf(first, second)).map { it.id })
    }

    @Test
    fun `reports the third state when a part of the row is checked`() {
        val checks = TaskChecks()

        checks.set(listOf(first), true)

        assertEquals(CheckState.SOME, checks.state(listOf(first, second)))
    }

    @Test
    fun `reports the full state when every task of the row is checked`() {
        val checks = TaskChecks()

        checks.set(listOf(first, second), true)

        assertEquals(CheckState.ALL, checks.state(listOf(first, second)))
    }

    @Test
    fun `reports no state for a row with no task`() {
        assertEquals(CheckState.NONE, TaskChecks().state(emptyList()))
    }

    @Test
    fun `clears one task and keeps the other one`() {
        val checks = TaskChecks()
        checks.set(listOf(first, second), true)

        checks.set(listOf(second), false)

        assertEquals(CheckState.SOME, checks.state(listOf(first, second)))
        assertEquals(1, checks.size)
    }

    @Test
    fun `clears every check box`() {
        val checks = TaskChecks()
        checks.set(listOf(first, second), true)

        checks.clear()

        assertEquals(0, checks.size)
        assertEquals(CheckState.NONE, checks.state(listOf(first, second)))
    }

    @Test
    fun `keeps the check after a reload builds new task objects`() {
        val checks = TaskChecks()
        checks.set(listOf(first), true)

        assertTrue(checks.isChecked(task("a")))
    }

    @Test
    fun `tells two repositories apart when they share a path`() {
        val checks = TaskChecks()
        val other = task("a", root = "/other")

        checks.set(listOf(first), true)

        assertFalse(checks.isChecked(other))
        assertEquals(CheckState.SOME, checks.state(listOf(first, other)))
    }
}
