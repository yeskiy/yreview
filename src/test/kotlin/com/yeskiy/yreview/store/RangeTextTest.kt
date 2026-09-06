package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The two forms that name the place of one comment.
 *
 * The rule holds no type of the IDE, so these tests read it without a running IDE.
 */
class RangeTextTest {

    @Test
    fun `a range of whole lines has no column`() {
        assertFalse(RangeText.hasColumns(0, 0))
        assertFalse(RangeText.hasColumns(null, null))
    }

    @Test
    fun `a range that starts at the first character still has a column`() {
        assertTrue(RangeText.hasColumns(0, 15))
    }

    @Test
    fun `the short form of whole lines holds the two line numbers`() {
        assertEquals("88-94", RangeText.compact(Range(startLine = 88, endLine = 94)))
    }

    @Test
    fun `the short form of a part of a line holds both characters`() {
        assertEquals(
            "88:4-94:9",
            RangeText.compact(Range(startLine = 88, startColumn = 4, endLine = 94, endColumn = 9)),
        )
    }

    @Test
    fun `the words of whole lines name the lines alone`() {
        assertEquals("lines 88-94", RangeText.words(Range(startLine = 88, endLine = 94)))
    }

    @Test
    fun `the words of a part of one line name the two characters`() {
        assertEquals(
            "lines 88-88, from character 4 to character 9",
            RangeText.words(Range(startLine = 88, startColumn = 4, endLine = 88, endColumn = 9)),
        )
    }

    @Test
    fun `the words of a part over several lines name the line of each character`() {
        assertEquals(
            "lines 88-94, from character 4 of line 88 to character 9 of line 94",
            RangeText.words(Range(startLine = 88, startColumn = 4, endLine = 94, endColumn = 9)),
        )
    }

    @Test
    fun `a range of whole lines answers no column`() {
        assertNull(Range(startLine = 88, endLine = 94).startColumnOrNull())
        assertNull(Range(startLine = 88, endLine = 94).endColumnOrNull())
    }

    @Test
    fun `a range of a part of a line answers both columns`() {
        assertEquals(0, Range(startLine = 1, endLine = 1, endColumn = 15).startColumnOrNull())
        assertEquals(15, Range(startLine = 1, endLine = 1, endColumn = 15).endColumnOrNull())
    }
}
