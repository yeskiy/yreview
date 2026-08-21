package com.yeskiy.yreview.store

import com.yeskiy.yreview.settings.CommentSharing
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NoteRefsTest {

    @Test
    fun `a comment that is not shared goes to the local ref`() {
        assertEquals(NoteRefs.LOCAL, NoteRefs.refFor(share = false))
    }

    @Test
    fun `a shared comment goes to the discuss ref`() {
        assertEquals(NoteRefs.DISCUSS, NoteRefs.refFor(share = true))
    }

    @Test
    fun `only the local ref stays out of the remote`() {
        assertFalse(NoteRefs.isShared(NoteRefs.LOCAL))
        assertTrue(NoteRefs.isShared(NoteRefs.DISCUSS))
        assertTrue(NoteRefs.isShared(NoteRefs.ANALYSES))
    }

    @Test
    fun `the local only setting writes the local ref`() {
        assertEquals(NoteRefs.LOCAL, NoteRefs.refFor(CommentSharing.LOCAL_ONLY.shareByDefault))
    }

    @Test
    fun `the shared setting writes the discuss ref`() {
        assertEquals(NoteRefs.DISCUSS, NoteRefs.refFor(CommentSharing.SHARED.shareByDefault))
    }
}
