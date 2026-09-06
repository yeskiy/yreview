package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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

    /** Every sentence that stands where the name of a product stands. */
    private fun sentences(spec: AgentSpec) = listOf(
        "Start ${AgentRows.buttonName(spec)}",
        AgentRows.sendReason(spec),
        AgentRows.noPush(spec),
        AgentRows.place(spec, answer()),
        AgentRows.place(spec, answer(spec.id)),
        SessionPlan.of("/work", BridgeLookup.ChannelOff, spec, "a-command-of-my-own").status,
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
    fun `no sentence about a search that found nothing states a fact about the machine`() {
        // The plugin tested a search path. A session starts through a login shell, which
        // reads a longer path, so a missing answer is no fact about the machine.
        val missed = AgentCatalog.ALL.filter { it.product }
            .flatMap { listOf(AgentRows.row(it, false), AgentRows.place(it, answer())) }
            .plus(AgentRows.NOTHING_FOUND)

        missed.forEach { assertFalse(it.contains("this machine"), it) }
    }

    @Test
    fun `the sentence of an empty search points at the command field`() {
        assertTrue(AgentRows.NOTHING_FOUND.contains("full path"), AgentRows.NOTHING_FOUND)
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
    fun `two choices of the list name no product`() {
        assertEquals(
            listOf(AgentId.CUSTOM, AgentId.NONE),
            AgentCatalog.ALL.filterNot { it.product }.map { it.id },
        )
    }

    @Test
    fun `no sentence about a choice that names no product ever names that choice`() {
        // The row of the selector prints the label on purpose, because the row is the
        // entry of a menu. Every sentence below stands where the name of a product
        // stands, so none of them may carry the label of a menu entry.
        AgentCatalog.ALL.filterNot { it.product }.forEach { spec ->
            sentences(spec).forEach {
                assertFalse(it.lowercase().contains(spec.label.lowercase()), "${spec.id}: $it")
            }
        }
    }

    @Test
    fun `every sentence about a product names that product`() {
        AgentCatalog.ALL.filter { it.product }.forEach { spec ->
            assertTrue(AgentRows.sendReason(spec).contains(spec.label), spec.id.name)
            assertTrue(AgentRows.noPush(spec).contains(spec.label), spec.id.name)
            assertTrue(AgentRows.place(spec, answer()).contains(spec.label), spec.id.name)
            assertTrue(AgentRows.place(spec, answer(spec.id)).contains(spec.label), spec.id.name)
        }
    }

    @Test
    fun `the send of a choice that names no product says what the plugin did`() {
        assertEquals(
            "The session window runs nothing",
            AgentRows.sendReason(AgentCatalog.of(AgentId.NONE)),
        )
        assertEquals(
            "The plugin puts no message into a command of your own",
            AgentRows.sendReason(AgentCatalog.of(AgentId.CUSTOM)),
        )
    }

    @Test
    fun `the send of a product names the product and the reason`() {
        assertEquals(
            "No Claude Code session reads this project",
            AgentRows.sendReason(AgentCatalog.of(AgentId.CLAUDE)),
        )
        assertEquals(
            "Antigravity CLI does not accept a message into a running session",
            AgentRows.sendReason(AgentCatalog.of(AgentId.ANTIGRAVITY)),
        )
    }

    @Test
    fun `the start button of a choice that names no product carries the plain word`() {
        assertEquals("the session", AgentRows.buttonName(AgentCatalog.of(AgentId.CUSTOM)))
        assertEquals("the session", AgentRows.buttonName(AgentCatalog.of(AgentId.NONE)))
        assertEquals("Claude Code", AgentRows.buttonName(claude))
    }

    @Test
    fun `the settings line of a choice that names no product carries the hint alone`() {
        assertEquals(
            AgentCatalog.of(AgentId.NONE).hint,
            AgentRows.place(AgentCatalog.of(AgentId.NONE), answer()),
        )
        assertEquals(
            AgentCatalog.of(AgentId.CUSTOM).hint,
            AgentRows.place(AgentCatalog.of(AgentId.CUSTOM), answer()),
        )
    }

    @Test
    fun `the settings line of a product names the find, or the search that missed it`() {
        assertEquals(
            "This machine holds Claude Code at /usr/bin/claude.",
            AgentRows.place(claude, answer(AgentId.CLAUDE)),
        )
        assertEquals(
            "The plugin did not find Claude Code on the search path of this IDE. ${claude.hint}",
            AgentRows.place(claude, answer()),
        )
        assertEquals(AgentRows.SEARCHING, AgentRows.place(claude, AgentScan.Answer.NOT_YET))
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
