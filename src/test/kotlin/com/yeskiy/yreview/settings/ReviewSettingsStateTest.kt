package com.yeskiy.yreview.settings

import com.intellij.openapi.util.JDOMUtil
import com.intellij.util.xmlb.XmlSerializer
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
    fun `an unset session window follows the search`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State())

        assertTrue(settings.sessionWindowShown(claudeFound = true))
        assertFalse(settings.sessionWindowShown(claudeFound = false))
    }

    @Test
    fun `a chosen session window beats the search`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State())

        settings.sessionWindow = false
        assertFalse(settings.sessionWindowShown(claudeFound = true))

        settings.sessionWindow = true
        assertTrue(settings.sessionWindowShown(claudeFound = false))
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
        assertEquals("", read.channelServer)
    }

    @Test
    fun `the default command is claude and the default channel server is empty`() {
        assertEquals("claude", ReviewSettings.State().claudeCommand)
        assertEquals("", ReviewSettings.State().channelServer)
    }

    @Test
    fun `the command and the channel server survive a write and a read`() {
        val state = ReviewSettings.State()
        state.claudeCommand = "C:\\tools\\claude.exe"
        state.channelServer = "E:/work/demo/channel/dist/main.js"

        assertEquals("C:\\tools\\claude.exe", read(state).claudeCommand)
        assertEquals("E:/work/demo/channel/dist/main.js", read(state).channelServer)
    }

    @Test
    fun `a blank command falls back to the default`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State())

        settings.claudeCommand = "   "
        assertEquals("claude", settings.claudeCommand)

        settings.claudeCommand = "  claude  "
        assertEquals("claude", settings.claudeCommand)
    }

    @Test
    fun `the channel server keeps an empty value and loses its spaces`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State())

        assertEquals("", settings.channelServer)

        settings.channelServer = "  /opt/y-review/channel/dist/main.js  "
        assertEquals("/opt/y-review/channel/dist/main.js", settings.channelServer)
    }

    @Test
    fun `the command and the channel server both round trip through the service`() {
        val settings = ReviewSettings()
        settings.loadState(ReviewSettings.State())
        settings.claudeCommand = "claude"
        settings.channelServer = "/opt/y-review/channel/dist/main.js"

        val second = ReviewSettings()
        second.loadState(read(settings.state))

        assertEquals("claude", second.claudeCommand)
        assertEquals("/opt/y-review/channel/dist/main.js", second.channelServer)
    }

    @Test
    fun `both values carry a label a person can read`() {
        assertEquals("Local only", CommentSharing.LOCAL_ONLY.label)
        assertEquals("Shared", CommentSharing.SHARED.label)
        assertTrue(CommentSharing.SHARED.shareByDefault)
    }
}
