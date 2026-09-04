package com.yeskiy.yreview.settings

import com.intellij.openapi.util.JDOMUtil
import com.intellij.util.xmlb.XmlSerializer
import com.yeskiy.yreview.session.AgentId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ReviewSettingsStateTest {

    private fun read(state: ReviewSettings.State): ReviewSettings.State =
        XmlSerializer.deserialize(XmlSerializer.serialize(state), ReviewSettings.State::class.java)

    @Test
    fun `the default setting keeps every new comment local`() {
        assertEquals(CommentSharing.LOCAL_ONLY, ReviewSettings.State().sharing)
        assertEquals(false, CommentSharing.LOCAL_ONLY.shareByDefault)
    }

    @Test
    fun `the shared setting survives a write and a read`() {
        val state = ReviewSettings.State()
        state.sharing = CommentSharing.SHARED

        assertEquals(CommentSharing.SHARED, read(state).sharing)
    }

    @Test
    fun `the channel starts on and survives a write and a read`() {
        assertEquals(true, ReviewSettings.State().channel)

        val state = ReviewSettings.State()
        state.channel = false

        assertEquals(false, read(state).channel)
    }

    @Test
    fun `the session window starts without a choice`() {
        assertNull(ReviewSettings.State().sessionWindow)
    }

    @Test
    fun `the session window shows unless the user cleared the switch`() {
        val settings = ReviewSettings()

        assertTrue(settings.sessionWindowShown())

        settings.sessionWindow = false

        assertFalse(settings.sessionWindowShown())
    }

    @Test
    fun `a chosen session window survives a load`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State().apply { sessionWindow = false })

        assertFalse(settings.sessionWindowShown())

        settings.sessionWindow = true

        assertTrue(settings.sessionWindowShown())
    }

    @Test
    fun `both session window answers survive a write and a read`() {
        val off = ReviewSettings.State()
        off.sessionWindow = false
        assertEquals(false, read(off).sessionWindow)

        val on = ReviewSettings.State()
        on.sessionWindow = true
        assertEquals(true, read(on).sessionWindow)
    }

    @Test
    fun `an old file without the two switches still loads`() {
        val old = "<State><option name=\"sharing\" value=\"SHARED\" /></State>"

        val read = XmlSerializer.deserialize(JDOMUtil.load(old), ReviewSettings.State::class.java)

        assertEquals(CommentSharing.SHARED, read.sharing)
        assertEquals(true, read.channel)
        assertNull(read.sessionWindow)
        assertEquals("claude", read.claudeCommand)
    }

    @Test
    fun `an old file that still names a channel server loads`() {
        // The plugin ships the channel server, so the settings page dropped that field.
        // A file of an earlier version still holds the key, and it must not stop the load.
        val old = "<State>" +
            "<option name=\"sharing\" value=\"SHARED\" />" +
            "<option name=\"channelServer\" value=\"E:/work/demo-repo/channel/dist/main.js\" />" +
            "<option name=\"claudeCommand\" value=\"my-claude\" />" +
            "</State>"

        val read = XmlSerializer.deserialize(JDOMUtil.load(old), ReviewSettings.State::class.java)

        assertEquals(CommentSharing.SHARED, read.sharing)
        assertEquals("my-claude", read.claudeCommand)
        assertEquals(true, read.channel)
    }

    @Test
    fun `the default command is claude`() {
        assertEquals("claude", ReviewSettings.State().claudeCommand)
    }

    @Test
    fun `the command survives a write and a read`() {
        val state = ReviewSettings.State()
        state.claudeCommand = "C:\\tools\\claude.exe"

        assertEquals("C:\\tools\\claude.exe", read(state).claudeCommand)
    }

    @Test
    fun `the choice and the commands round trip through the service`() {
        val settings = ReviewSettings()
        settings.agent = AgentId.OPENCODE
        settings.setCommand(AgentId.OPENCODE, "/opt/oc/opencode")
        settings.markMcpAdded(AgentId.CURSOR)

        val second = ReviewSettings()
        second.loadState(read(settings.state))

        assertEquals(AgentId.OPENCODE, second.agent)
        assertEquals("/opt/oc/opencode", second.command(AgentId.OPENCODE))
        assertTrue(second.mcpAdded(AgentId.CURSOR))
    }

    @Test
    fun `a fresh install has chosen no agent`() {
        val settings = ReviewSettings()

        assertNull(settings.agent)
        assertFalse(settings.agentChosen)
        assertEquals(AgentId.CLAUDE, settings.agentOrDefault())
    }

    @Test
    fun `a chosen agent comes back`() {
        val settings = ReviewSettings()

        settings.agent = AgentId.OPENCODE

        assertEquals(AgentId.OPENCODE, settings.agent)
        assertTrue(settings.agentChosen)
        assertEquals("OPENCODE", settings.state.agent)
    }

    @Test
    fun `a stored name this build does not know counts as no choice`() {
        val settings = ReviewSettings()

        settings.loadState(ReviewSettings.State().apply { agent = "WINDSURF" })

        assertNull(settings.agent)
        assertFalse(settings.agentChosen)
    }

    @Test
    fun `every agent keeps a command of its own`() {
        val settings = ReviewSettings()

        settings.setCommand(AgentId.CLAUDE, "C:/tools/claude.exe")
        settings.setCommand(AgentId.OPENCODE, "/opt/oc/opencode")

        assertEquals("C:/tools/claude.exe", settings.command(AgentId.CLAUDE))
        assertEquals("/opt/oc/opencode", settings.command(AgentId.OPENCODE))
        assertEquals("codex", settings.command(AgentId.CODEX))
    }

    @Test
    fun `a blank command falls back to the default of that agent`() {
        val settings = ReviewSettings()

        settings.setCommand(AgentId.GEMINI, "   ")

        assertEquals("gemini", settings.command(AgentId.GEMINI))
        assertFalse(settings.state.agentCommands.containsKey("GEMINI"))
    }

    @Test
    fun `the custom agent has no default command`() {
        val settings = ReviewSettings()

        assertEquals("", settings.command(AgentId.CUSTOM))

        settings.setCommand(AgentId.CUSTOM, "my-agent")

        assertEquals("my-agent", settings.command(AgentId.CUSTOM))
    }

    @Test
    fun `an older file that held one claude command keeps it`() {
        val settings = ReviewSettings()

        settings.loadState(ReviewSettings.State().apply { claudeCommand = "D:/bin/claude.cmd" })

        assertEquals("D:/bin/claude.cmd", settings.command(AgentId.CLAUDE))
    }

    @Test
    fun `an older file with the plain default needs no migration`() {
        val settings = ReviewSettings()

        settings.loadState(ReviewSettings.State().apply { claudeCommand = "claude" })

        assertEquals("claude", settings.command(AgentId.CLAUDE))
        assertFalse(settings.state.agentCommands.containsKey("CLAUDE"))
    }

    @Test
    fun `an older build still reads the claude command this build wrote`() {
        val settings = ReviewSettings()

        settings.setCommand(AgentId.CLAUDE, "C:/tools/claude.exe")

        assertEquals("C:/tools/claude.exe", settings.state.claudeCommand)
    }

    @Test
    fun `a stored registration is remembered once`() {
        val settings = ReviewSettings()

        assertFalse(settings.mcpAdded(AgentId.ANTIGRAVITY))

        settings.markMcpAdded(AgentId.ANTIGRAVITY)
        settings.markMcpAdded(AgentId.ANTIGRAVITY)

        assertTrue(settings.mcpAdded(AgentId.ANTIGRAVITY))
        assertFalse(settings.mcpAdded(AgentId.CURSOR))
        assertEquals(listOf("ANTIGRAVITY"), settings.state.mcpAdded)
    }

    @Test
    fun `the none choice is a real choice`() {
        val settings = ReviewSettings()

        settings.agent = AgentId.NONE

        assertTrue(settings.agentChosen)
        assertEquals(AgentId.NONE, settings.agentOrDefault())
    }

    @Test
    fun `the four page values carry their defaults`() {
        val state = ReviewSettings.State()

        assertEquals("origin", state.remote)
        assertTrue(state.writeRefspec)
        assertTrue(state.editorMarks)
        assertTrue(state.autoStartSession)
    }

    @Test
    fun `the four page values survive a write and a read`() {
        val state = ReviewSettings.State()
        state.remote = "upstream"
        state.writeRefspec = false
        state.editorMarks = false
        state.autoStartSession = false

        val second = read(state)

        assertEquals("upstream", second.remote)
        assertFalse(second.writeRefspec)
        assertFalse(second.editorMarks)
        assertFalse(second.autoStartSession)
    }

    @Test
    fun `a blank remote falls back to origin`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State())

        settings.remote = "   "
        assertEquals("origin", settings.remote)

        settings.remote = "  upstream  "
        assertEquals("upstream", settings.remote)
    }

    @Test
    fun `an old file without the four page values still loads`() {
        val old = "<State><option name=\"sharing\" value=\"SHARED\" /></State>"

        val read = XmlSerializer.deserialize(JDOMUtil.load(old), ReviewSettings.State::class.java)

        assertEquals("origin", read.remote)
        assertTrue(read.writeRefspec)
        assertTrue(read.editorMarks)
        assertTrue(read.autoStartSession)
    }

    @Test
    fun `both values carry a label a person can read`() {
        assertEquals("Local only", CommentSharing.LOCAL_ONLY.label)
        assertEquals("Shared", CommentSharing.SHARED.label)
        assertTrue(CommentSharing.SHARED.shareByDefault)
    }
}
