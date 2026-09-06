package com.yeskiy.yreview.action

import com.yeskiy.yreview.store.Range
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The rule that names the part of a line a comment covers.
 *
 * The rule holds no type of the IDE, so these tests read it without a running IDE. The same
 * trick carries [CommentPlaceTest].
 */
class CommentRangeTest {

    @Test
    fun `a caret names one whole line`() {
        assertEquals(
            Range(startLine = 12, endLine = 12),
            CommentRange.of(startLine = 12, startColumn = 4, endLine = 12, endColumn = 4, endLineLength = 40),
        )
    }

    @Test
    fun `a selection from the start of one line to the start of the next names whole lines`() {
        assertEquals(
            Range(startLine = 5, endLine = 6),
            CommentRange.of(startLine = 5, startColumn = 0, endLine = 6, endColumn = 0, endLineLength = 30),
        )
    }

    @Test
    fun `a selection of the text of one line names a whole line`() {
        assertEquals(
            Range(startLine = 5, endLine = 5),
            CommentRange.of(startLine = 5, startColumn = 0, endLine = 5, endColumn = 30, endLineLength = 30),
        )
    }

    @Test
    fun `a word at the start of a line names its characters`() {
        assertEquals(
            Range(startLine = 1, startColumn = 0, endLine = 1, endColumn = 15),
            CommentRange.of(startLine = 1, startColumn = 0, endLine = 1, endColumn = 15, endLineLength = 40),
        )
    }

    @Test
    fun `a selection that leaves the indent outside names its characters`() {
        assertEquals(
            Range(startLine = 5, startColumn = 4, endLine = 5, endColumn = 10),
            CommentRange.of(startLine = 5, startColumn = 4, endLine = 5, endColumn = 10, endLineLength = 10),
        )
    }

    @Test
    fun `a selection over several lines names both characters`() {
        assertEquals(
            Range(startLine = 5, startColumn = 4, endLine = 7, endColumn = 9),
            CommentRange.of(startLine = 5, startColumn = 4, endLine = 7, endColumn = 9, endLineLength = 30),
        )
    }

    @Test
    fun `a selection that ends at the start of a later line keeps its first character`() {
        assertEquals(
            Range(startLine = 5, startColumn = 3, endLine = 7, endColumn = 0),
            CommentRange.of(startLine = 5, startColumn = 3, endLine = 7, endColumn = 0, endLineLength = 30),
        )
    }
}
