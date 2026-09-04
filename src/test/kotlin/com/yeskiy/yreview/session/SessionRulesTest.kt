package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.BridgeServer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionRulesTest {

    @Test
    fun `the first tab takes the number one`() {
        assertEquals(1, SessionRules.freeNumber(emptySet()))
    }

    @Test
    fun `a new tab takes the smallest number that no open tab holds`() {
        assertEquals(2, SessionRules.freeNumber(setOf(1, 3)))
        assertEquals(4, SessionRules.freeNumber(setOf(1, 2, 3)))
        assertEquals(1, SessionRules.freeNumber(setOf(2, 3)))
    }

    @Test
    fun `the window opens no tab over the stream limit of the bridge`() {
        assertEquals(BridgeServer.MAX_STREAMS, SessionRules.MAX_SESSIONS)
        assertTrue(SessionRules.canOpen(0))
        assertTrue(SessionRules.canOpen(SessionRules.MAX_SESSIONS - 1))
        assertFalse(SessionRules.canOpen(SessionRules.MAX_SESSIONS))
        assertFalse(SessionRules.canOpen(SessionRules.MAX_SESSIONS + 1))
    }

    @Test
    fun `the sixteenth tab opens and the seventeenth does not`() {
        // The bridge serves 16 event streams, so the sixteenth tab is the last one.
        assertTrue(SessionRules.canOpen(15))
        assertEquals(16, SessionRules.freeNumber((1..15).toSet()))
        assertFalse(SessionRules.canOpen(16))
    }

    @Test
    fun `the built name carries the short name of the agent`() {
        assertEquals("Claude 2", SessionRules.name(TabFacts(2, "Claude", SessionState.RUNNING)))
        assertEquals("Aider 1", SessionRules.name(TabFacts(1, "Aider", SessionState.RUNNING)))
    }

    @Test
    fun `a tab with no agent reads the plain stem`() {
        // The window opens a tab before anybody chose an agent, so the tab must still
        // carry a name, and that name must not claim an agent.
        assertEquals("Session 1", SessionRules.name(TabFacts(1, null, SessionState.NOT_STARTED)))
    }

    @Test
    fun `the name of the agent stands alone`() {
        // The number belongs to a name that the plugin built. A name that somebody gave
        // this session carries no number.
        assertEquals(
            "fix the parser",
            SessionRules.name(TabFacts(2, "Claude", SessionState.RUNNING, byAgent = "fix the parser")),
        )
    }

    @Test
    fun `the name of the agent beats the name of the user`() {
        // The agent name describes the session that runs now. The user name was given to
        // the tab before that session started.
        assertEquals(
            "fix the parser",
            SessionRules.name(
                TabFacts(2, "Claude", SessionState.RUNNING, byAgent = "fix the parser", byUser = "my notes"),
            ),
        )
    }

    @Test
    fun `the name of the user beats the built name`() {
        assertEquals(
            "my notes",
            SessionRules.name(TabFacts(2, "Codex", SessionState.RUNNING, byUser = "my notes")),
        )
    }

    @Test
    fun `a blank given name is no name`() {
        // A cleared name must bring the built name back, and a name of spaces is cleared.
        assertEquals("Codex 2", SessionRules.name(TabFacts(2, "Codex", SessionState.RUNNING, byUser = "   ")))
        assertEquals("Codex 2", SessionRules.name(TabFacts(2, "Codex", SessionState.RUNNING, byAgent = "")))
    }

    @Test
    fun `a running session shows the name alone`() {
        assertEquals("Claude 1", SessionRules.label(TabFacts(1, "Claude", SessionState.RUNNING)))
    }

    @Test
    fun `every other state stands beside the name`() {
        assertEquals("Claude 2 (not started)", SessionRules.label(TabFacts(2, "Claude", SessionState.NOT_STARTED)))
        assertEquals("Claude 2 (starting)", SessionRules.label(TabFacts(2, "Claude", SessionState.STARTING)))
        assertEquals("Claude 2 (ended)", SessionRules.label(TabFacts(2, "Claude", SessionState.ENDED)))
    }

    @Test
    fun `a long name is cut for the tab and kept for the tooltip`() {
        val long = "rewrite the whole authentication layer of the server"
        val facts = TabFacts(1, "Claude", SessionState.RUNNING, byAgent = long)

        assertEquals(SessionRules.MAX_TAB, SessionRules.label(facts).length)
        assertTrue(SessionRules.label(facts).endsWith("..."))
        assertEquals(long, SessionRules.tooltip(facts))
    }

    @Test
    fun `a short name is never cut`() {
        assertEquals("Claude 1", SessionRules.fit("Claude 1"))
        assertEquals("Claude 1", SessionRules.tooltip(TabFacts(1, "Claude", SessionState.RUNNING)))
    }

    @Test
    fun `the tooltip carries the state as well`() {
        assertEquals(
            "Claude 2 (ended)",
            SessionRules.tooltip(TabFacts(2, "Claude", SessionState.ENDED)),
        )
    }

    @Test
    fun `every label starts with the name of the tab, cut to the tab width`() {
        SessionState.entries.forEach {
            val facts = TabFacts(3, "Claude", it)
            assertTrue(SessionRules.label(facts).startsWith(SessionRules.fit(SessionRules.name(facts))), it.name)
        }
    }

    @Test
    fun `names that differ are left alone`() {
        assertEquals(
            listOf("Claude 1", "Codex 2"),
            SessionRules.apart(listOf("Claude 1", "Codex 2")),
        )
    }

    @Test
    fun `a repeated name takes a number so the picker stays readable`() {
        // Two agents can give one name to two sessions, and a user can type one name twice.
        assertEquals(
            listOf("fix the parser (1)", "fix the parser (2)"),
            SessionRules.apart(listOf("fix the parser", "fix the parser")),
        )
    }

    @Test
    fun `only the repeated names take a number`() {
        assertEquals(
            listOf("a (1)", "b", "a (2)"),
            SessionRules.apart(listOf("a", "b", "a")),
        )
    }

    @Test
    fun `an empty list stays empty`() {
        assertEquals(emptyList(), SessionRules.apart(emptyList()))
    }
}
