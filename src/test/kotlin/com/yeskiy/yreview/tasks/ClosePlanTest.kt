package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.bridge.ResolveRequest
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

    // --- The size of one batch ---

    @Test
    fun `one batch holds no more identifiers than the channel takes`() {
        val plan = ClosePlan.of(many(ResolveRequest.MAX_IDS + 50), indexReady = true)

        assertEquals(ResolveRequest.MAX_IDS, plan.comments.size)
    }

    @Test
    fun `a batch inside the cap keeps every identifier`() {
        val plan = ClosePlan.of(many(ResolveRequest.MAX_IDS), indexReady = true)

        assertEquals(ResolveRequest.MAX_IDS, plan.comments.size)
        assertTrue(plan.dropped.isEmpty())
        assertNull(plan.overflowProblem)
    }

    @Test
    fun `a caller that states no cap keeps every identifier`() {
        val plan = ClosePlan.of(many(ResolveRequest.MAX_IDS + 50), indexReady = true, limit = ClosePlan.NO_CAP)

        assertEquals(ResolveRequest.MAX_IDS + 50, plan.comments.size)
        assertTrue(plan.dropped.isEmpty())
        assertNull(plan.overflowProblem)
    }

    @Test
    fun `a caller that states a cap of its own takes that one`() {
        val plan = ClosePlan.of(many(10), indexReady = true, limit = 4)

        assertEquals(4, plan.comments.size)
        assertEquals(6, plan.dropped.size)
    }

    @Test
    fun `the problem names how many identifiers the cap left out`() {
        val plan = ClosePlan.of(many(ResolveRequest.MAX_IDS + 50), indexReady = true)

        assertEquals(50, plan.dropped.size)
        val problem = plan.overflowProblem.orEmpty()
        assertTrue(problem.startsWith(ClosePlan.TOO_MANY), "the reason comes first: $problem")
        assertTrue(problem.contains("50"), problem)
    }

    @Test
    fun `the cap counts a todo identifier with the comments`() {
        val plan = ClosePlan.of(many(ResolveRequest.MAX_IDS) + todo, indexReady = true)

        assertEquals(listOf(todo), plan.dropped)
        assertTrue(plan.todos.isEmpty())
    }

    /** [count] comment identifiers, each one a name the plugin itself could have made. */
    private fun many(count: Int): List<String> = (1..count).map { "%040x".format(it) }
}
