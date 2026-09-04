package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AgentTitleTest {

    private val claude = AgentCatalog.of(AgentId.CLAUDE)
    private val copilot = AgentCatalog.of(AgentId.COPILOT)
    private val cursor = AgentCatalog.of(AgentId.CURSOR)

    @Test
    fun `claude code writes a spinner in front of the name`() {
        // Measured on a live session. The console title read the spinner, a space, and
        // the session name, and the session file held the same name.
        assertEquals("y-review", AgentTitle.of(claude, "\u25D0 y-review"))
        assertEquals("y-review", AgentTitle.of(claude, "\u25D1 y-review"))
        assertEquals("y-review", AgentTitle.of(claude, "\u2733 y-review"))
    }

    @Test
    fun `claude code with the prefix off still names the session`() {
        assertEquals("fix the parser", AgentTitle.of(claude, "fix the parser"))
    }

    @Test
    fun `every plain title of claude code names no session`() {
        assertNull(AgentTitle.of(claude, "claude"))
        assertNull(AgentTitle.of(claude, "\u2733 claude"))
        assertNull(AgentTitle.of(claude, "claude \u00B7 resume"))
        assertNull(AgentTitle.of(claude, "claude daemon"))
        assertNull(AgentTitle.of(claude, "\u2733 Claude Code"))
    }

    @Test
    fun `copilot names the session in the first part of three`() {
        assertEquals(
            "fix the parser",
            AgentTitle.of(copilot, "fix the parser - Reading files - GitHub Copilot"),
        )
    }

    @Test
    fun `copilot with two parts names nothing`() {
        // A title of two parts holds the name or the intent, and nothing tells them apart.
        assertNull(AgentTitle.of(copilot, "Reading files - GitHub Copilot"))
        assertNull(AgentTitle.of(copilot, "GitHub Copilot"))
    }

    @Test
    fun `a title of copilot without the tail names nothing`() {
        assertNull(AgentTitle.of(copilot, "some other program"))
    }

    @Test
    fun `cursor names the session in front of the status`() {
        assertEquals("fix the parser", AgentTitle.of(cursor, "fix the parser - \u23F3 Working ..."))
        assertEquals("fix the parser", AgentTitle.of(cursor, "fix the parser - \u2705 Ready"))
    }

    @Test
    fun `cursor with no status names the session alone`() {
        assertEquals("fix the parser", AgentTitle.of(cursor, "fix the parser"))
    }

    @Test
    fun `the plain title of cursor names no session`() {
        assertNull(AgentTitle.of(cursor, "Cursor Agent"))
        assertNull(AgentTitle.of(cursor, "Cursor Agent - \u2705 Ready"))
    }

    @Test
    fun `the plain title of cursor names no session with a worktree`() {
        assertNull(AgentTitle.of(cursor, "Cursor Agent (my-worktree)"))
        assertNull(AgentTitle.of(cursor, "Cursor Agent (my-worktree) - \u2705 Ready"))
    }

    @Test
    fun `a name of cursor keeps the whole text of a worktree`() {
        // A reader that cut the group would guess where the name ends.
        assertEquals("fix the parser (main)", AgentTitle.of(cursor, "fix the parser (main)"))
        assertEquals(
            "fix the parser (main)",
            AgentTitle.of(cursor, "fix the parser (main) - \u23F3 Working ..."),
        )
    }

    @Test
    fun `a title that swing would draw as markup names nothing`() {
        // Any program in the terminal writes the window title, and a Swing label reads a
        // text that starts with the markup tag as markup.
        assertNull(AgentTitle.of(claude, "<html><b>owned</b>"))
        assertNull(AgentTitle.of(claude, "<HTML>owned"))
        assertNull(AgentTitle.of(copilot, "<html>x - y - GitHub Copilot"))
        assertNull(AgentTitle.of(cursor, "<html>x"))
    }

    @Test
    fun `an agent with no proved shape names nothing`() {
        // Antigravity writes a title, and the shape of that text is not proved. A guess
        // would put status text on a tab.
        assertNull(AgentTitle.of(AgentCatalog.of(AgentId.ANTIGRAVITY), "anything at all"))
        assertNull(AgentTitle.of(AgentCatalog.of(AgentId.AIDER), "aider"))
        assertNull(AgentTitle.of(AgentCatalog.of(AgentId.CUSTOM), "my own tool"))
    }

    @Test
    fun `an empty title names nothing`() {
        assertNull(AgentTitle.of(claude, null))
        assertNull(AgentTitle.of(claude, ""))
        assertNull(AgentTitle.of(claude, "   "))
        assertNull(AgentTitle.of(claude, "\u25D0 "))
    }

    @Test
    fun `a title over the length limit names nothing`() {
        // A very long title is a status line, and it would fill the whole tab bar.
        assertNull(AgentTitle.of(claude, "x".repeat(AgentTitle.LONGEST + 1)))
    }

    @Test
    fun `a title of many lines becomes one line`() {
        assertEquals("one two", AgentTitle.of(claude, "\u25D0 one\ntwo"))
    }
}
