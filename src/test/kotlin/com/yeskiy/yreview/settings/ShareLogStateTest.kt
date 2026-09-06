package com.yeskiy.yreview.settings

import com.intellij.util.xmlb.XmlSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShareLogStateTest {

    @Test
    fun `a comment that never reached the remote survives a write and a read`() {
        val state = ShareLog.State()
        state.marks.add(ShareLog.Mark("c3f9a12", ROOT, REF))

        val read = XmlSerializer.deserialize(XmlSerializer.serialize(state), ShareLog.State::class.java)

        assertEquals(1, read.marks.size)
        assertEquals("c3f9a12", read.marks.single().id)
        assertEquals(ROOT, read.marks.single().root)
        assertEquals(REF, read.marks.single().ref)
    }

    @Test
    fun `the log holds one entry per comment`() {
        val log = ShareLog()
        log.markUnshared("c3f9a12", ROOT, REF)
        log.markUnshared("c3f9a12", ROOT, REF)

        assertTrue(log.isUnshared("c3f9a12"))
        assertEquals(1, log.getState().marks.size)
    }

    @Test
    fun `a push that works clears the marks of that root and that ref`() {
        val log = ShareLog()
        log.markUnshared("c3f9a12", ROOT, REF)

        log.clear(ROOT, REF)

        assertFalse(log.isUnshared("c3f9a12"))
    }

    @Test
    fun `a push of one root keeps the mark of another root`() {
        val log = ShareLog()
        log.markUnshared("c3f9a12", ROOT, REF)
        log.markUnshared("b71e004", OTHER_ROOT, REF)

        log.clear(ROOT, REF)

        assertFalse(log.isUnshared("c3f9a12"))
        assertTrue(log.isUnshared("b71e004"), "no push carried the comment of the other repository")
    }

    @Test
    fun `a push of one ref keeps the mark of another ref`() {
        val log = ShareLog()
        log.markUnshared("c3f9a12", ROOT, REF)
        log.markUnshared("b71e004", ROOT, OTHER_REF)

        log.clear(ROOT, REF)

        assertFalse(log.isUnshared("c3f9a12"))
        assertTrue(log.isUnshared("b71e004"), "no push carried the comment of the other ref")
    }

    @Test
    fun `the log reads the plain identifiers of an older version`() {
        val old = ShareLog.State()
        old.unshared.add("c3f9a12")
        val log = ShareLog()

        log.loadState(XmlSerializer.deserialize(XmlSerializer.serialize(old), ShareLog.State::class.java))

        assertTrue(log.isUnshared("c3f9a12"), "a mark of an older file must stay a mark")
        assertTrue(log.getState().unshared.isEmpty(), "the new file holds marks and no plain list")
    }

    @Test
    fun `a push clears a mark that an older version wrote`() {
        val old = ShareLog.State()
        old.unshared.add("c3f9a12")
        val log = ShareLog()
        log.loadState(old)

        log.clear(ROOT, REF)

        assertFalse(log.isUnshared("c3f9a12"), "a mark of an older file names no push, so any push clears it")
    }

    private companion object {
        const val ROOT = "/home/user/project"
        const val OTHER_ROOT = "/home/user/other"
        const val REF = "refs/notes/devtools/discuss"
        const val OTHER_REF = "refs/notes/devtools/analyses"
    }
}
