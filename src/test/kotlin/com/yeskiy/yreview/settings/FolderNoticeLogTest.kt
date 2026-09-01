package com.yeskiy.yreview.settings

import com.intellij.util.xmlb.XmlSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FolderNoticeLogTest {

    @Test
    fun `a new log has told nobody`() {
        assertFalse(FolderNoticeLog().told("E:/one"))
    }

    @Test
    fun `a marked root stays marked`() {
        val log = FolderNoticeLog()
        log.markTold("E:/one")
        assertTrue(log.told("E:/one"))
        assertFalse(log.told("E:/two"))
    }

    @Test
    fun `a second mark adds no duplicate`() {
        val log = FolderNoticeLog()
        log.markTold("E:/one")
        log.markTold("E:/one")
        assertEquals(1, log.getState().told.size)
    }

    @Test
    fun `the state survives the serializer`() {
        val log = FolderNoticeLog()
        log.markTold("E:/one")
        val copy = FolderNoticeLog()
        copy.loadState(
            XmlSerializer.deserialize(XmlSerializer.serialize(log.getState()), FolderNoticeLog.State::class.java)
        )
        assertTrue(copy.told("E:/one"))
    }
}
