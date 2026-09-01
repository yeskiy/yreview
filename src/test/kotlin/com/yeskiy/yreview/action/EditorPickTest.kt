package com.yeskiy.yreview.action

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * The rule that names the editor of the Add Review Comment action.
 *
 * A markdown file always opens in a split editor. The preview side of that editor holds no
 * editor, so the data context names none while the preview holds the focus. The rule reads
 * the file editor of the tab in that case, and the split editor gives its text side.
 *
 * The names here stand for the values of a data context. The rule holds no type of the IDE,
 * so these tests read it without a running IDE.
 */
class EditorPickTest {

    private val caret = "the editor under the caret"

    private val textSide = "the text side of the tab"

    private val tab = "the file editor of the tab"

    @Test
    fun `a context that names an editor gives that editor`() {
        assertEquals(caret, EditorPick.pick<String, String>(caret, null) { textSide })
    }

    @Test
    fun `a context that names both gives the editor under the caret`() {
        assertEquals(caret, EditorPick.pick(caret, tab) { textSide })
    }

    @Test
    fun `a context of a file editor alone gives the text side of that tab`() {
        assertEquals(textSide, EditorPick.pick(null, tab) { textSide })
    }

    @Test
    fun `a file editor that holds no text side gives nothing`() {
        assertNull(EditorPick.pick<String, String>(null, tab) { null })
    }

    @Test
    fun `a context that names neither gives nothing`() {
        assertNull(EditorPick.pick<String, String>(null, null) { textSide })
    }
}
