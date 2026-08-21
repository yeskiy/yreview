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

    @Test
    fun `keeps both kinds by default`() {
        val kept = TaskFilter.apply(todos + comment, null, TaskKindFilter.BOTH)

        assertEquals(listOf("a", "b", "c"), kept.map { it.id })
    }

    @Test
    fun `keeps the review comments only`() {
        val kept = TaskFilter.apply(todos + comment, null, TaskKindFilter.COMMENTS)

        assertEquals(listOf("c"), kept.map { it.id })
    }

    @Test
    fun `keeps the todo items only`() {
        val kept = TaskFilter.apply(todos + comment, null, TaskKindFilter.TODOS)

        assertEquals(listOf("a", "b"), kept.map { it.id })
    }

    @Test
    fun `a todo filter does not bring back a hidden review comment`() {
        val kept = TaskFilter.apply(todos + comment, setOf(FIXME_RULE), TaskKindFilter.TODOS)

        assertEquals(listOf("b"), kept.map { it.id })
    }

    @Test
    fun `a todo filter does not remove the comments of the comments only view`() {
        val kept = TaskFilter.apply(todos + comment, setOf(FIXME_RULE), TaskKindFilter.COMMENTS)

        assertEquals(listOf("c"), kept.map { it.id })
    }

    @Test
    fun `a comments only view keeps the comment when the todo filter holds no pattern`() {
        val kept = TaskFilter.apply(todos + comment, emptySet(), TaskKindFilter.COMMENTS)

        assertEquals(listOf("c"), kept.map { it.id })
    }

    @Test
    fun `the two filters answer on their own`() {
        assertTrue(TaskFilter.acceptsKind(comment, TaskKindFilter.COMMENTS))
        assertFalse(TaskFilter.acceptsKind(comment, TaskKindFilter.TODOS))
        assertTrue(TaskFilter.acceptsRules(comment, setOf(FIXME_RULE)))
        assertFalse(TaskFilter.accepts(comment, setOf(FIXME_RULE), TaskKindFilter.TODOS))
    }

    @Test
    fun `names every kind of the filter menu`() {
        assertEquals(
            listOf("Comments and TODO Items", "Review Comments Only", "TODO Items Only"),
            TaskKindFilter.entries.map { it.label },
        )
    }

    companion object {
        private const val TODO_RULE = "\\btodo\\b.*"

        private const val FIXME_RULE = "\\bfixme\\b.*"
    }
}
