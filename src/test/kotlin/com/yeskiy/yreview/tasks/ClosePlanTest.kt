package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What one batch of reported identifiers may do right now.
 *
 * A TODO identifier needs the index of the IDE. A comment identifier needs the git notes
 * only, so a comment closes at every moment.
 */
class ClosePlanTest {

    private val comment = "c3f9a12aabbccddeeff00112233445566778899a"

    private val todo = TaskIds.forTodo("src/Main.kt", 12)

    @Test
    fun `a ready index takes both kinds`() {
        val plan = ClosePlan.of(listOf(comment, todo), indexReady = true)

        assertEquals(listOf(comment), plan.comments)
        assertEquals(listOf(todo), plan.todos)
        assertEquals(emptyList(), plan.deferred)
        assertNull(plan.deferralProblem)
    }

    @Test
    fun `an index that builds holds the todo identifiers back`() {
        val plan = ClosePlan.of(listOf(comment, todo), indexReady = false)

        assertEquals(emptyList(), plan.todos)
        assertEquals(listOf(todo), plan.deferred)
    }

    @Test
    fun `an index that builds still closes the comments`() {
        val plan = ClosePlan.of(listOf(comment, todo), indexReady = false)

        assertEquals(listOf(comment), plan.comments)
    }

    @Test
    fun `the problem names the identifiers the plan held back`() {
        val problem = ClosePlan.of(listOf(todo), indexReady = false).deferralProblem.orEmpty()

        assertTrue(problem.startsWith(ClosePlan.INDEX_BUSY), "the reason comes first: $problem")
        assertTrue(problem.contains(todo), "the agent must read which identifiers to report again")
    }

    @Test
    fun `one identifier that arrives twice reaches the plan once`() {
        val plan = ClosePlan.of(listOf(comment, comment, todo, todo), indexReady = true)

        assertEquals(listOf(comment), plan.comments)
        assertEquals(listOf(todo), plan.todos)
    }
}
