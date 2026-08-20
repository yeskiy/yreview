package com.yeskiy.ideareview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionPlanTest {

    private val project = "E:/work/demo"
    private val token = "0123456789abcdef0123"
    private val ready = BridgeLookup.Available("http://127.0.0.1:52431", token)

    @Test
    fun `the plan runs the launcher in the project directory`() {
        val plan = SessionPlan.of(project, ready)
        assertEquals(ClaudeCommand.shellCommand(), plan.command)
        assertEquals(project, plan.workingDirectory)
    }

    @Test
    fun `the plan hands the bridge to the session as two variables`() {
        assertEquals(
            mapOf(
                BridgeDiscovery.URL_VARIABLE to "http://127.0.0.1:52431",
                BridgeDiscovery.TOKEN_VARIABLE to token
            ),
            SessionPlan.of(project, ready).environment
        )
    }

    @Test
    fun `the token never reaches the command line`() {
        val plan = SessionPlan.of(project, ready)
        assertFalse(plan.command.any { it.contains(token) })
        assertFalse(plan.status.contains(token))
    }

    @Test
    fun `a missing bridge still starts the session`() {
        val plan = SessionPlan.of(project, BridgeLookup.Unavailable("The bridge file does not exist yet."))
        assertEquals(ClaudeCommand.shellCommand(), plan.command)
        assertTrue(plan.environment.isEmpty())
        assertFalse(plan.bridgeReady)
    }

    @Test
    fun `a missing bridge is stated in the status text`() {
        val plan = SessionPlan.of(project, BridgeLookup.Unavailable("The bridge file does not exist yet."))
        assertTrue(plan.status.contains("The bridge file does not exist yet."))
        assertTrue(plan.status.contains("not available"))
    }

    @Test
    fun `a ready bridge is stated in the status text`() {
        val plan = SessionPlan.of(project, ready)
        assertTrue(plan.bridgeReady)
        assertTrue(plan.status.contains("http://127.0.0.1:52431"))
    }

    @Test
    fun `the plan converts a wsl project path`() {
        assertEquals(project, SessionPlan.of("/mnt/e/Projects/Opened/idea-review", ready).workingDirectory)
    }
}
