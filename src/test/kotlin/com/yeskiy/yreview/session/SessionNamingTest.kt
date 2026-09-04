package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SessionNamingTest {

    @Test
    fun `a typed name loses the spaces at both ends`() {
        assertEquals("my notes", SessionNaming.clean("  my notes  "))
    }

    @Test
    fun `an empty answer clears the name`() {
        // A user who empties the field asks for the built name back.
        assertNull(SessionNaming.clean(""))
        assertNull(SessionNaming.clean("   "))
        assertNull(SessionNaming.clean(null))
    }

    @Test
    fun `a name of many lines becomes one line`() {
        // A paste can carry a line break, and a tab shows one line.
        assertEquals("one two", SessionNaming.clean("one\ntwo"))
        assertEquals("one two", SessionNaming.clean("one\r\ntwo"))
        assertEquals("one two", SessionNaming.clean("one \t two"))
    }

    @Test
    fun `a name over the limit is cut to the limit`() {
        val long = "x".repeat(SessionNaming.MAX_NAME + 20)

        assertEquals(SessionNaming.MAX_NAME, SessionNaming.clean(long)!!.length)
    }

    @Test
    fun `an agent that owns the name blocks the rename and says the command`() {
        val text = SessionNaming.blocked(AgentCatalog.of(AgentId.CLAUDE))!!

        assertTrue(text.contains("Claude Code"), text)
        assertTrue(text.contains("/rename"), text)
    }

    @Test
    fun `an agent that leaves the name free blocks nothing`() {
        assertNull(SessionNaming.blocked(AgentCatalog.of(AgentId.CODEX)))
        assertNull(SessionNaming.blocked(AgentCatalog.of(AgentId.AMP)))
    }

    @Test
    fun `a tab with no agent blocks nothing`() {
        // A tab of a project where nobody chose an agent may still take a name.
        assertNull(SessionNaming.blocked(null))
    }

    @Test
    fun `every agent that owns the name gets a readable sentence`() {
        AgentCatalog.ALL.filter { it.naming is Naming.Agent }.forEach {
            val text = SessionNaming.blocked(it)

            assertTrue(text != null && text.contains(it.label), it.id.name)
        }
    }
}
