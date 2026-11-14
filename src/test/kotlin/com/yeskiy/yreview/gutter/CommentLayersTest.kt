package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.testFramework.EditorTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.Range

/**
 * The marks that the comments of one file paint in a real editor.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class CommentLayersTest : BasePlatformTestCase() {

    private val text = "val answer = 42\nval other = 1\n"

    private fun paint(vararg ranges: Range): List<RangeHighlighter> =
        CommentLayers.paint(myFixture.editor, ranges.toList())

    private fun RangeHighlighter.place() = Triple(startOffset, endOffset, targetArea)

    fun `test a comment on a part of a line paints only its characters`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(Triple(4, 10, HighlighterTargetArea.EXACT_RANGE)),
            paint(Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 10)).map { it.place() },
        )
    }

    fun `test a comment on whole lines paints the whole lines`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(Triple(0, 29, HighlighterTargetArea.LINES_IN_RANGE)),
            paint(Range(startLine = 1, endLine = 2)).map { it.place() },
        )
    }

    fun `test a comment over two lines paints from the start column to the end column`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(Triple(4, 19, HighlighterTargetArea.EXACT_RANGE)),
            paint(Range(startLine = 1, startColumn = 4, endLine = 2, endColumn = 3)).map { it.place() },
        )
    }

    fun `test an end column past the line end stops at the line end`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(Triple(4, 15, HighlighterTargetArea.EXACT_RANGE)),
            paint(Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 99)).map { it.place() },
        )
    }

    fun `test columns that are both past the line end paint the whole line`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(Triple(0, 15, HighlighterTargetArea.LINES_IN_RANGE)),
            paint(Range(startLine = 1, startColumn = 40, endLine = 1, endColumn = 50)).map { it.place() },
        )
    }

    fun `test an end line past the document end stops at the document end`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(Triple(20, 30, HighlighterTargetArea.EXACT_RANGE)),
            paint(Range(startLine = 2, startColumn = 4, endLine = 9, endColumn = 2)).map { it.place() },
        )
    }

    fun `test a comment that starts past the document end paints nothing`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(emptyList<RangeHighlighter>(), paint(Range(startLine = 7, endLine = 8)))
    }

    fun `test a soft wrapped line paints only the characters of the comment`() {
        myFixture.configureByText("a.txt", "val words = " + "alpha beta gamma delta ".repeat(8) + "\n")
        EditorTestUtil.configureSoftWraps(myFixture.editor, 20)
        assertTrue(myFixture.editor.offsetToVisualPosition(150).line > 0)

        assertEquals(
            listOf(Triple(18, 28, HighlighterTargetArea.EXACT_RANGE)),
            paint(Range(startLine = 1, startColumn = 18, endLine = 1, endColumn = 28)).map { it.place() },
        )
    }
}
