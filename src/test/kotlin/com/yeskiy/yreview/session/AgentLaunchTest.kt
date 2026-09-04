package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgentLaunchTest {

    private val config = "C:\\Users\\dev\\AppData\\Local\\Temp\\y-review-mcp-1.json"

    private val java = "C:\\Program Files\\JetBrains\\jbr\\bin\\java.exe"

    private val jar = "C:\\Users\\dev\\plugins\\y-review\\channel\\y-review-channel.jar"

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
    fun `an agent that reads a variable gets no flag at all`() {
        assertEquals(listOf("opencode"), AgentLaunch.arguments(opencode, "opencode", config))
    }

    @Test
    fun `opencode binds the loopback port the plugin gave it`() {
        assertEquals(
            listOf("opencode", "--hostname", "127.0.0.1", "--port", "47821"),
            AgentLaunch.arguments(opencode, "opencode", config, port = 47821),
        )
    }

    @Test
    fun `only claude code takes the channel flag`() {
        AgentCatalog.ALL.filter { it.id != AgentId.CLAUDE }.forEach {
            assertFalse(
                AgentLaunch.arguments(it, "run-it", config, java, jar).contains(AgentLaunch.CHANNEL_FLAG),
                it.label,
            )
        }
    }

    @Test
    fun `an agent with a stored route or no route takes the command alone`() {
        listOf(AgentId.ANTIGRAVITY, AgentId.CURSOR, AgentId.AIDER, AgentId.AMP, AgentId.CUSTOM, AgentId.NONE)
            .forEach {
                assertEquals(
                    listOf("run-it"),
                    AgentLaunch.arguments(AgentCatalog.of(it), "run-it", config, java, jar),
                    it.name,
                )
            }
    }

    @Test
    fun `codex carries the two dotted keys of its registration`() {
        val arguments = AgentLaunch.arguments(AgentCatalog.of(AgentId.CODEX), "codex", config, java, jar)

        assertEquals("codex", arguments.first())
        assertEquals(2, arguments.count { it == "-c" })
        assertTrue(arguments.any { it.startsWith("mcp_servers.y-review.command=") }, arguments.toString())
        assertTrue(arguments.any { it.startsWith("mcp_servers.y-review.args=") }, arguments.toString())
    }

    @Test
    fun `an agent reads the registration file through its own variable`() {
        assertEquals(mapOf("OPENCODE_CONFIG" to config), AgentLaunch.variables(opencode, config))
        assertEquals(emptyMap(), AgentLaunch.variables(claude, config))
        assertEquals(emptyMap(), AgentLaunch.variables(opencode, null))
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
    fun `the settings page prints the real keys for codex`() {
        val text = AgentLaunch.appendedText(AgentId.CODEX)

        assertTrue(text.contains("mcp_servers.y-review.command="), text)
        assertTrue(text.contains("mcp_servers.y-review.args="), text)
    }

    @Test
    fun `the settings page says that an agent with a variable gets no argument`() {
        assertEquals("The plugin appends no argument for this agent.", AgentLaunch.appendedText(AgentId.OPENCODE))
        assertEquals("The plugin appends no argument for this agent.", AgentLaunch.appendedText(AgentId.NONE))
    }

    @Test
    fun `the settings page prints the command that a press on add runs`() {
        assertEquals(
            "agy mcp add y-review -- $java -cp $jar com.yeskiy.yreview.channel.MainKt",
            AgentLaunch.appendedText(AgentId.ANTIGRAVITY, java, jar),
        )
    }

    @Test
    fun `the settings page prints the document that a press on add writes`() {
        val text = AgentLaunch.appendedText(AgentId.CURSOR, java, jar)

        assertTrue(text.contains("mcpServers"), text)
        assertTrue(text.contains("com.yeskiy.yreview.channel.MainKt"), text)
    }

    @Test
    fun `the settings page names a placeholder while a path is unknown`() {
        val text = AgentLaunch.appendedText(AgentId.ANTIGRAVITY)

        assertTrue(text.contains(AgentLaunch.JAVA_PLACE), text)
        assertTrue(text.contains(AgentLaunch.SERVER_PLACE), text)
    }
}
