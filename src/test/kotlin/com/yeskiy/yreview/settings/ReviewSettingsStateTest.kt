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
    }

    @Test
    fun `both values carry a label a person can read`() {
        assertEquals("Local only", CommentSharing.LOCAL_ONLY.label)
        assertEquals("Shared", CommentSharing.SHARED.label)
        assertTrue(CommentSharing.SHARED.shareByDefault)
    }
}
