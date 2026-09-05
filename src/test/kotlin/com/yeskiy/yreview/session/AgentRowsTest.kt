package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AgentRowsTest {

    private val claude = AgentCatalog.of(AgentId.CLAUDE)

    private val opencode = AgentCatalog.of(AgentId.OPENCODE)

    private fun answer(vararg found: AgentId) = AgentScan.Answer(
        AgentCatalog.ALL.associate {
            it.id to if (it.id in found) AgentInstall("/usr/bin/${it.defaultCommand}", AgentSource.PATH)
            else AgentInstall.NOTHING
        },
        scanned = true,
    )

    @Test
    fun `both agents that take a send say so`() {
        assertEquals("Claude Code, found on this machine. Send and Copy both work.", AgentRows.row(claude, true))
        assertEquals("OpenCode, found on this machine. Send and Copy both work.", AgentRows.row(opencode, true))
    }

    @Test
    fun `an agent that takes no send says copy only`() {
        assertEquals(
            "Gemini CLI, found on this machine. " +
                "Copy only, because it takes no message into a running session.",
            AgentRows.row(AgentCatalog.of(AgentId.GEMINI), true),
        )
    }

    @Test
    fun `a row of an agent the scan missed never says that it is absent`() {
        // A shell function has no file, so no scan can find it and no message may deny it.
        val text = AgentRows.row(claude, false)

        assertTrue(text.contains("not found"), text)
        assertTrue(text.contains("Claude Code"), text)
        assertEquals(false, text.contains("not installed"))
    }

    @Test
    fun `no row of any agent ever says that it is not installed`() {
        AgentCatalog.ALL.forEach {
            assertEquals(false, AgentRows.row(it, false).contains("not installed"), it.label)
            assertEquals(false, AgentRows.row(it, true).contains("not installed"), it.label)
        }
    }

    @Test
    fun `a missing tool names the desktop application of the same brand`() {
        // A user with the desktop application must never read that their product is gone.
        val text = AgentRows.row(AgentCatalog.of(AgentId.CODEX), false)

        assertTrue(text.contains("ChatGPT desktop application"), text)
        assertTrue(text.contains("A terminal cannot run it."), text)
    }

    @Test
    fun `a found tool says nothing about the desktop application`() {
        val text = AgentRows.row(AgentCatalog.of(AgentId.CODEX), true)

        assertEquals(false, text.contains("ChatGPT"))
    }

    @Test
    fun `the panel offers the found agents, then another agent, then no agent`() {
        assertEquals(
            listOf(AgentId.CLAUDE, AgentId.OPENCODE, AgentId.CUSTOM, AgentId.NONE),
            AgentRows.offered(answer(AgentId.CLAUDE, AgentId.OPENCODE)).map { it.id },
        )
    }

    @Test
    fun `the panel offers nothing while no search has finished`() {
        assertEquals(emptyList(), AgentRows.offered(AgentScan.Answer.NOT_YET))
    }

    @Test
    fun `a machine with no agent still offers a real choice`() {
        assertEquals(listOf(AgentId.CUSTOM, AgentId.NONE), AgentRows.offered(answer()).map { it.id })
        assertTrue(AgentRows.NOTHING_FOUND.contains("Settings"), AgentRows.NOTHING_FOUND)
        assertTrue(AgentRows.OTHER_AGENTS.contains("Settings"), AgentRows.OTHER_AGENTS)
    }

    @Test
    fun `the no agent row says what to do instead`() {
        val text = AgentRows.row(AgentCatalog.of(AgentId.NONE), false)

        assertTrue(text.startsWith("No agent."), text)
        assertEquals(false, text.contains("not found"))
        assertTrue(AgentRows.NO_AGENT.contains("the Copy button"), AgentRows.NO_AGENT)
    }

    @Test
    fun `the another agent row never says that a search missed it`() {
        // Another agent names no command, so no search can look for it.
        val text = AgentRows.row(AgentCatalog.of(AgentId.CUSTOM), false)

        assertTrue(text.startsWith("Another agent."), text)
        assertEquals(false, text.contains("not found"))
        assertEquals(false, text.contains("Copy only"))
    }
}
