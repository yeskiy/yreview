package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgentLaunchTest {

    private val config = "C:\\Users\\dev\\AppData\\Local\\Temp\\y-review-mcp-1.json"

    private val claude = AgentCatalog.of(AgentId.CLAUDE)

    private val opencode = AgentCatalog.of(AgentId.OPENCODE)

    @Test
    fun `without a configuration file the session runs the command alone`() {
        assertEquals(listOf("claude"), AgentLaunch.arguments(claude, "claude"))
    }

    @Test
    fun `claude code gets the two flags of the channel`() {
        assertEquals(
            listOf("claude", "--mcp-config", config, "--dangerously-load-development-channels", "server:y-review"),
            AgentLaunch.arguments(claude, "claude", config),
        )
    }

    @Test
    fun `an agent without a channel gets no flag at all`() {
        assertEquals(listOf("opencode"), AgentLaunch.arguments(opencode, "opencode", config))
    }

    @Test
    fun `every agent but claude code takes the command alone`() {
        AgentCatalog.ALL.filter { it.id != AgentId.CLAUDE }.forEach {
            assertEquals(listOf("run-it"), AgentLaunch.arguments(it, "run-it", config), it.label)
        }
    }

    @Test
    fun `the channel value names the server of the plugin`() {
        assertEquals("y-review", AgentLaunch.SERVER_NAME)
        assertEquals("server:y-review", AgentLaunch.CHANNEL_VALUE)
        assertEquals("--mcp-config", AgentLaunch.CONFIG_FLAG)
        assertEquals("--dangerously-load-development-channels", AgentLaunch.CHANNEL_FLAG)
    }

    @Test
    fun `the arguments never name a bridge variable`() {
        // The bridge address and the bridge token travel in the environment. A command line
        // is readable by every process on the machine.
        val text = AgentLaunch.arguments(claude, "claude", config).joinToString(" ")

        assertFalse(text.contains("Y_REVIEW_BRIDGE"))
    }

    @Test
    fun `the settings page prints the real flags for claude code`() {
        val text = AgentLaunch.appendedText(AgentId.CLAUDE)

        assertTrue(text.contains("--mcp-config"), text)
        assertTrue(text.contains("--dangerously-load-development-channels server:y-review"), text)
    }

    @Test
    fun `the settings page says that another agent gets no flag`() {
        assertEquals("The plugin appends no argument for this agent.", AgentLaunch.appendedText(AgentId.OPENCODE))
    }
}
