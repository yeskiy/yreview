package com.yeskiy.ideareview.settings

import com.intellij.util.xmlb.XmlSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShareLogStateTest {

    @Test
    fun `a comment that never reached the remote survives a write and a read`() {
        val state = ShareLog.State()
        state.unshared.add("c3f9a12")

        val read = XmlSerializer.deserialize(XmlSerializer.serialize(state), ShareLog.State::class.java)

        assertEquals(listOf("c3f9a12"), read.unshared)
    }

    @Test
    fun `the log holds one entry per comment`() {
        val log = ShareLog()
        log.markUnshared("c3f9a12")
        log.markUnshared("c3f9a12")

        assertTrue(log.isUnshared("c3f9a12"))
        assertEquals(1, log.getState().unshared.size)
    }

    @Test
    fun `a push that works clears every mark`() {
        val log = ShareLog()
        log.markUnshared("c3f9a12")
        log.clear()

        assertFalse(log.isUnshared("c3f9a12"))
    }
}
