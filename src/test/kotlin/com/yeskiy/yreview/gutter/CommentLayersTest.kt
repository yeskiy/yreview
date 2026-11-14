package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.testFramework.EditorTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.ui.ReviewColors

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

    private fun layers(vararg ranges: Range): List<CommentLayer> =
        CommentLayers.layersOf(myFixture.editor.document, ranges.toList())

    fun `test two comments on the same characters paint one piece of depth two`() {
        myFixture.configureByText("a.txt", text)
        val words = Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 10)

        assertEquals(listOf(CommentLayer(4, 10, 2, false)), layers(words, words))
    }

    fun `test two part comments that overlap split into three pieces`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(CommentLayer(0, 4, 1, false), CommentLayer(4, 8, 2, false), CommentLayer(8, 12, 1, false)),
            layers(
                Range(startLine = 1, startColumn = 0, endLine = 1, endColumn = 8),
                Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 12),
            ),
        )
    }

    fun `test two whole line comments that overlap give one line of depth two`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(CommentLayer(0, 15, 1, true), CommentLayer(16, 29, 2, true)),
            layers(Range(startLine = 1, endLine = 2), Range(startLine = 2, endLine = 2)),
        )
    }

    fun `test a part comment inside a whole line comment counts both`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(CommentLayer(0, 15, 1, true), CommentLayer(4, 10, 2, false)),
            layers(
                Range(startLine = 1, endLine = 1),
                Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 10),
            ),
        )
    }

    fun `test comments that only touch do not overlap`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(
            listOf(CommentLayer(0, 10, 1, false)),
            layers(
                Range(startLine = 1, startColumn = 0, endLine = 1, endColumn = 4),
                Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 10),
            ),
        )
    }

    fun `test a deeper piece paints a stronger background than a single comment`() {
        myFixture.configureByText("a.txt", text)
        val scheme = myFixture.editor.colorsScheme
        val words = Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 10)
        val base = scheme.getAttributes(ReviewColors.COMMENT_RANGE).backgroundColor

        assertEquals(
            listOf(base, CommentLayers.shade(base, scheme.defaultBackground, 2)),
            listOf(paint(words), paint(words, words)).map { it.single().getTextAttributes(scheme)?.backgroundColor },
        )
    }

    fun `test a single comment keeps the color key of the scheme`() {
        myFixture.configureByText("a.txt", text)

        assertEquals(ReviewColors.COMMENT_RANGE, paint(Range(startLine = 1, endLine = 1)).single().textAttributesKey)
    }

    fun `test many overlapping comments split in one pass and merge equal neighbors`() {
        myFixture.configureByText("a.txt", "x".repeat(MANY) + "\n")
        val many = (0 until MANY).map { Range(startLine = 1, startColumn = it, endLine = 1, endColumn = it + 3) }

        val started = System.nanoTime()
        val pieces = layers(*many.toTypedArray())
        val took = (System.nanoTime() - started) / 1_000_000

        assertEquals(
            listOf(CommentLayer(0, 1, 1, false), CommentLayer(1, 2, 2, false), CommentLayer(2, MANY, 3, false)),
            pieces,
        )
        assertTrue("the split of $MANY comments took $took ms", took < LIMIT_MILLIS)
    }
}

/** How many comments the cost guard builds. A file can hold one comment for every line. */
private const val MANY = 100_000

/** The bound is far above the real time of one sorted pass, so a slow machine still passes. */
private const val LIMIT_MILLIS = 2_000L
