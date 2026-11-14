package com.yeskiy.yreview.gutter

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CoverNoteTest {

    private val card = "<html><body><b>a@b.c</b><br/>the text</body></html>"

    @Test
    fun `one comment on a line adds no note`() {
        assertNull(CoverNote.text(1))
        assertEquals(card, CoverNote.html(1, card))
        assertEquals("the text", CoverNote.plain(1, "the text"))
    }

    @Test
    fun `the note states the count of the comments that cover the line`() {
        assertEquals("3 open comments cover this line.", CoverNote.text(3))
    }

    @Test
    fun `the html card starts with the note inside one body`() {
        assertEquals(
            "<html><body><i>2 open comments cover this line.</i><hr/><b>a@b.c</b><br/>the text</body></html>",
            CoverNote.html(2, card),
        )
    }

    @Test
    fun `the plain card starts with the note`() {
        assertEquals("2 open comments cover this line.\n\nthe text", CoverNote.plain(2, "the text"))
    }
}
