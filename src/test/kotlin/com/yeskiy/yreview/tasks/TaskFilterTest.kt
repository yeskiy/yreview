package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TaskFilterTest {

    private fun todo(id: String, rule: String) = ReviewTask(
        id = id,
        kind = TaskKind.TODO,
        path = "src/A.kt",
        startLine = 1,
        endLine = 1,
        text = "TODO: work on $id",
        filePath = "/repo/src/A.kt",
        rootPath = "/repo",
        patternRule = rule,
    )

    private val comment = ReviewTask(
        id = "c",
        kind = TaskKind.COMMENT,
        path = "src/A.kt",
        startLine = 1,
        endLine = 1,
        text = "please rename this",
        filePath = "/repo/src/A.kt",
        rootPath = "/repo",
    )

    private val todos = listOf(todo("a", TODO_RULE), todo("b", FIXME_RULE))

    @Test
    fun `keeps every row when the user chose no filter`() {
        assertEquals(3, TaskFilter.apply(todos + comment, null).size)
    }

    @Test
    fun `keeps the rows of the chosen filter only`() {
        val kept = TaskFilter.apply(todos, setOf(FIXME_RULE))

        assertEquals(listOf("b"), kept.map { it.id })
    }

    @Test
    fun `keeps a review comment whatever the filter holds`() {
        val kept = TaskFilter.apply(todos + comment, setOf(FIXME_RULE))

        assertEquals(listOf("b", "c"), kept.map { it.id })
    }

    @Test
    fun `drops a todo whose pattern left the settings`() {
        assertFalse(TaskFilter.accepts(todo("a", TODO_RULE), setOf(FIXME_RULE)))
        assertFalse(TaskFilter.accepts(todo("a", ""), setOf(FIXME_RULE)))
    }

    @Test
    fun `accepts a todo of the filter`() {
        assertTrue(TaskFilter.accepts(todo("a", TODO_RULE), setOf(TODO_RULE, FIXME_RULE)))
    }

    @Test
    fun `keeps no row when the filter holds no pattern`() {
        assertTrue(TaskFilter.apply(todos, emptySet()).isEmpty())
    }

    companion object {
        private const val TODO_RULE = "\\btodo\\b.*"

        private const val FIXME_RULE = "\\bfixme\\b.*"
    }
}
