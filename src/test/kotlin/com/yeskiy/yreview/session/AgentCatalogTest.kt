package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AgentCatalogTest {

    @Test
    fun `the catalog holds one record for every identifier`() {
        assertEquals(AgentId.entries.toSet(), AgentCatalog.ALL.map { it.id }.toSet())
        assertEquals(AgentId.entries.size, AgentCatalog.ALL.size)
    }

    @Test
    fun `claude code is the default and it carries the channel`() {
        assertEquals(AgentId.CLAUDE, AgentCatalog.DEFAULT)
        assertEquals(PushKind.CHANNEL, AgentCatalog.of(AgentId.CLAUDE).push)
        assertEquals("claude", AgentCatalog.of(AgentId.CLAUDE).defaultCommand)
    }

    @Test
    fun `exactly two agents take a send`() {
        assertEquals(
            listOf(AgentId.CLAUDE, AgentId.OPENCODE),
            AgentCatalog.ALL.filter { it.push != PushKind.NONE }.map { it.id },
        )
        assertEquals(PushKind.LOCAL_HTTP, AgentCatalog.of(AgentId.OPENCODE).push)
    }

    @Test
    fun `a per session route names its flag or its variable`() {
        assertEquals(McpRoute.Flag("--mcp-config", ""), AgentCatalog.of(AgentId.CLAUDE).mcp)
        assertEquals(McpRoute.Variable("OPENCODE_CONFIG"), AgentCatalog.of(AgentId.OPENCODE).mcp)
        assertEquals(McpRoute.Keys, AgentCatalog.of(AgentId.CODEX).mcp)
        assertEquals(
            McpRoute.Variable("GEMINI_CLI_SYSTEM_DEFAULTS_PATH"),
            AgentCatalog.of(AgentId.GEMINI).mcp,
        )
        assertEquals(McpRoute.Flag("--additional-mcp-config", "@"), AgentCatalog.of(AgentId.COPILOT).mcp)
    }

    @Test
    fun `a stored route asks the user first`() {
        assertEquals(McpRoute.AddCommand, AgentCatalog.of(AgentId.ANTIGRAVITY).mcp)
        assertEquals(McpRoute.UserFile(".cursor/mcp.json"), AgentCatalog.of(AgentId.CURSOR).mcp)
    }

    @Test
    fun `an agent with no proved route registers nothing`() {
        // Aider reads no server at all. Amp has no route this plugin proved.
        assertEquals(McpRoute.None, AgentCatalog.of(AgentId.AIDER).mcp)
        assertEquals(McpRoute.None, AgentCatalog.of(AgentId.AMP).mcp)
        assertEquals(McpRoute.None, AgentCatalog.of(AgentId.CUSTOM).mcp)
        assertEquals(McpRoute.None, AgentCatalog.of(AgentId.NONE).mcp)
    }

    @Test
    fun `the none entry runs nothing and names no command`() {
        val none = AgentCatalog.of(AgentId.NONE)

        assertFalse(none.runnable)
        assertEquals(emptyList(), none.commands)
        assertEquals(PushKind.NONE, none.push)
    }

    @Test
    fun `the custom entry runs a command the user names`() {
        val custom = AgentCatalog.of(AgentId.CUSTOM)

        assertTrue(custom.runnable)
        assertEquals(emptyList(), custom.commands)
        assertEquals("", custom.defaultCommand)
    }

    @Test
    fun `the cursor record holds both installed names`() {
        assertEquals(listOf("cursor-agent", "agent"), AgentCatalog.of(AgentId.CURSOR).commands)
    }

    @Test
    fun `a brand with a desktop application says so`() {
        assertEquals("Claude Desktop", AgentCatalog.of(AgentId.CLAUDE).desktop?.label)
        assertFalse(AgentCatalog.of(AgentId.CLAUDE).desktop!!.sharesConfig)
        assertTrue(AgentCatalog.of(AgentId.CODEX).desktop!!.sharesConfig)
        assertTrue(AgentCatalog.of(AgentId.ANTIGRAVITY).desktop!!.sharesConfig)
        assertTrue(AgentCatalog.of(AgentId.CURSOR).desktop!!.sharesConfig)
        assertNull(AgentCatalog.of(AgentId.COPILOT).desktop)
        assertNull(AgentCatalog.of(AgentId.NONE).desktop)
    }

    @Test
    fun `every desktop note says that the window cannot run it`() {
        AgentCatalog.ALL.mapNotNull { it.desktop }.forEach {
            assertTrue(it.note.contains("cannot run it"), it.label)
            assertTrue(it.label.isNotBlank())
        }
    }

    @Test
    fun `every record carries a label and a hint`() {
        AgentCatalog.ALL.forEach {
            assertTrue(it.label.isNotBlank(), "${it.id} has no label")
            assertTrue(it.hint.isNotBlank(), "${it.id} has no hint")
        }
    }

    @Test
    fun `the found agents stand first and none stands last`() {
        val order = AgentCatalog.ordered(setOf(AgentId.GEMINI, AgentId.CODEX)).map { it.id }

        assertEquals(listOf(AgentId.CODEX, AgentId.GEMINI), order.take(2))
        assertEquals(AgentId.NONE, order.last())
        assertEquals(AgentId.entries.size, order.size)
    }

    @Test
    fun `a stored name comes back as the same identifier`() {
        AgentId.entries.forEach { assertEquals(it, AgentCatalog.parse(it.name)) }
    }

    @Test
    fun `an unknown stored name is not a choice`() {
        assertNull(AgentCatalog.parse(null))
        assertNull(AgentCatalog.parse(""))
        assertNull(AgentCatalog.parse("   "))
        assertNull(AgentCatalog.parse("WINDSURF"))
        assertNull(AgentCatalog.parse("claude"))
    }

    @Test
    fun `every record carries a short name that fits a tab`() {
        AgentCatalog.ALL.forEach {
            assertTrue(it.short.isNotBlank(), "${it.id} has no short name")
            assertTrue(it.short.length <= 12, "${it.id} has a short name of ${it.short.length} characters")
        }
    }

    @Test
    fun `the short name of every agent is the one the tab shows`() {
        assertEquals("Claude", AgentCatalog.of(AgentId.CLAUDE).short)
        assertEquals("OpenCode", AgentCatalog.of(AgentId.OPENCODE).short)
        assertEquals("Codex", AgentCatalog.of(AgentId.CODEX).short)
        assertEquals("Antigravity", AgentCatalog.of(AgentId.ANTIGRAVITY).short)
        assertEquals("Gemini", AgentCatalog.of(AgentId.GEMINI).short)
        assertEquals("Copilot", AgentCatalog.of(AgentId.COPILOT).short)
        assertEquals("Cursor", AgentCatalog.of(AgentId.CURSOR).short)
        assertEquals("Aider", AgentCatalog.of(AgentId.AIDER).short)
        assertEquals("Amp", AgentCatalog.of(AgentId.AMP).short)
        assertEquals("Agent", AgentCatalog.of(AgentId.CUSTOM).short)
        assertEquals("Session", AgentCatalog.of(AgentId.NONE).short)
    }

    @Test
    fun `five agents name their own sessions`() {
        assertEquals(
            listOf(AgentId.CLAUDE, AgentId.OPENCODE, AgentId.ANTIGRAVITY, AgentId.COPILOT, AgentId.CURSOR),
            AgentCatalog.ALL.filter { it.naming is Naming.Agent }.map { it.id },
        )
    }

    @Test
    fun `an agent that names its own session takes no rename from the plugin`() {
        assertFalse(AgentCatalog.of(AgentId.CLAUDE).renamable)
        assertFalse(AgentCatalog.of(AgentId.CURSOR).renamable)
    }

    @Test
    fun `every other agent leaves the name to the user`() {
        // Amp renames a thread with a separate shell command, not inside the session.
        // The title lives on a server that the plugin cannot read, so no two names can
        // fight. The owner therefore chose to let the user name an Amp tab.
        listOf(AgentId.CODEX, AgentId.GEMINI, AgentId.AIDER, AgentId.AMP, AgentId.CUSTOM, AgentId.NONE)
            .forEach { assertTrue(AgentCatalog.of(it).renamable, it.name) }
    }

    @Test
    fun `an agent that owns the name names the command the user types`() {
        AgentCatalog.ALL.mapNotNull { it.naming as? Naming.Agent }.forEach {
            assertTrue(it.command.startsWith("/"), it.command)
        }
        assertEquals(Naming.Agent("/rename"), AgentCatalog.of(AgentId.CLAUDE).naming)
    }

    @Test
    fun `the plugin offers a rename for every agent that names no session of its own`() {
        AgentCatalog.ALL.forEach {
            assertEquals(it.naming is Naming.User, it.renamable, it.id.name)
        }
    }

    @Test
    fun `every agent answers who names a session`() {
        val byAgent = AgentCatalog.ALL.filter { it.naming is Naming.Agent }.map { it.id }
        val byUser = AgentCatalog.ALL.filter { it.naming is Naming.User }.map { it.id }

        assertEquals(AgentId.entries.toSet(), (byAgent + byUser).toSet())
        assertEquals(AgentId.entries.size, byAgent.size + byUser.size)
    }
}
