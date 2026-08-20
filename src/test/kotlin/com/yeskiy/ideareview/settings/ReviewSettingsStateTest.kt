package com.yeskiy.ideareview.settings

import com.intellij.util.xmlb.XmlSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReviewSettingsStateTest {

    @Test
    fun `the default setting keeps every new comment local`() {
        assertEquals(CommentSharing.LOCAL_ONLY, ReviewSettings.State().sharing)
        assertEquals(false, CommentSharing.LOCAL_ONLY.shareByDefault)
    }

    @Test
    fun `the shared setting survives a write and a read`() {
        val state = ReviewSettings.State()
        state.sharing = CommentSharing.SHARED

        val read = XmlSerializer.deserialize(XmlSerializer.serialize(state), ReviewSettings.State::class.java)

        assertEquals(CommentSharing.SHARED, read.sharing)
    }

    @Test
    fun `both values carry a label a person can read`() {
        assertEquals("Local only", CommentSharing.LOCAL_ONLY.label)
        assertEquals("Shared", CommentSharing.SHARED.label)
        assertTrue(CommentSharing.SHARED.shareByDefault)
    }
}
