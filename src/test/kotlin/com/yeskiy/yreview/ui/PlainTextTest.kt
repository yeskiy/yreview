package com.yeskiy.yreview.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A value of a review record reaches a label of the platform, and that label draws markup.
 * The record can come from another person, so the rule runs before the label sees the value.
 */
class PlainTextTest {

    @Test
    fun `a plain value stays as it is`() {
        assertEquals("alice@example.com", PlainText.of("alice@example.com"))
    }

    @Test
    fun `a value that starts with the markup tag reads as unknown`() {
        assertEquals(PlainText.UNKNOWN, PlainText.of("<html><b>alice</b>"))
    }

    @Test
    fun `the case of the markup tag changes nothing`() {
        assertEquals(PlainText.UNKNOWN, PlainText.of("<HtMl><img src=x>"))
    }

    @Test
    fun `a space in front of the markup tag changes nothing`() {
        assertEquals(PlainText.UNKNOWN, PlainText.of("  <html>x"))
    }

    @Test
    fun `a tag inside the value keeps the value`() {
        assertEquals("see <html> here", PlainText.of("see <html> here"))
    }

    @Test
    fun `a cut of the value keeps every character whole`() {
        // Half of a character draws as a broken glyph in a tab name and in a notice.
        val wide = String(Character.toChars(0x1F680))

        val cut = PlainText.of("y".repeat(PlainText.LONGEST - 1) + wide + "tail")

        assertEquals("y".repeat(PlainText.LONGEST - 1) + PlainText.MORE, cut)
    }

    @Test
    fun `a value over the cap ends with the mark`() {
        val cut = PlainText.of("x".repeat(PlainText.LONGEST + 40))

        assertEquals(PlainText.LONGEST + PlainText.MORE.length, cut.length)
        assertTrue(cut.endsWith(PlainText.MORE), cut)
    }

    @Test
    fun `a value of the length of the cap keeps every character`() {
        val text = "y".repeat(PlainText.LONGEST)

        assertEquals(text, PlainText.of(text))
    }

    @Test
    fun `the caller can set a shorter cap`() {
        assertEquals("abc${PlainText.MORE}", PlainText.of("abcdefgh", limit = 3))
    }

    @Test
    fun `a value that is missing reads as an empty text`() {
        assertEquals("", PlainText.of(null))
    }

    @Test
    fun `the markup test answers the tag and nothing else`() {
        assertTrue(PlainText.isMarkup("<html>"))
        assertFalse(PlainText.isMarkup("<b>bold</b>"))
        assertFalse(PlainText.isMarkup(""))
    }
}
