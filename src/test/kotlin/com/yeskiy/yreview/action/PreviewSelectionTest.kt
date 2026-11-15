package com.yeskiy.yreview.action

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.Range
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PreviewSelectionTest {

    // Offsets of "# T\n\npara one\npara two\n": line 0 at 0, line 2 at 5, line 3 at 14, end 23.
    private val starts = listOf(0, 4, 5, 14, 23)
    private val lineOf = { offset: Int -> starts.indexOfLast { it <= offset } }

    @Test
    fun `one line inside a paragraph`() =
        assertEquals(3..3, PreviewSelection.lines(Edge(5, 22, 1), Edge(5, 22, 1), lineOf))

    @Test
    fun `whole blocks when the points have no breaks`() =
        assertEquals(0..2, PreviewSelection.lines(Edge(0, 3, 0), Edge(5, 13, 0), lineOf))

    @Test
    fun `the line stays inside the element`() =
        assertEquals(2..3, PreviewSelection.lines(Edge(5, 22, 0), Edge(5, 22, 9), lineOf))

    @Test
    fun `reads the message of the page`() =
        assertEquals(
            Picked(Edge(5, 22, 0), Edge(5, 22, 1)),
            PreviewSelection.parse("""{"start":{"from":5,"to":22,"breaks":0},"end":{"from":5,"to":22,"breaks":1}}"""),
        )

    @Test
    fun `refuses a broken or a reversed message`() {
        assertNull(PreviewSelection.parse(""))
        assertNull(PreviewSelection.parse("""{"start":{"from":9,"to":2,"breaks":0},"end":{"from":5,"to":22,"breaks":0}}"""))
        assertNull(PreviewSelection.parse("""{"start":{"from":-1,"to":2,"breaks":0},"end":{"from":5,"to":22,"breaks":0}}"""))
        assertNull(PreviewSelection.parse("not json"))
    }

    @Test
    fun `the store forgets a selection of an older document`() {
        val panel = Any()
        val picked = Picked(Edge(0, 3, 0), Edge(0, 3, 0))
        PreviewSelections.put(panel, picked, stamp = 7)
        assertEquals(picked, PreviewSelections.of(panel, stamp = 7))
        assertNull(PreviewSelections.of(panel, stamp = 8))
        PreviewSelections.remove(panel)
        assertNull(PreviewSelections.of(panel, stamp = 7))
    }
}

/** The target of whole lines of a real document. The method names start with test for JUnit 3. */
class CommentTargetLinesTest : BasePlatformTestCase() {

    fun `test two whole lines give the range from the first line start to the last line end`() {
        myFixture.configureByText("a.txt", "one\ntwo\nthree\nfour\n")

        assertEquals(
            Range(startLine = 3, endLine = 4),
            CommentTarget.fromLines(myFixture.editor.document, "a.txt", 2..3).range,
        )
    }
}
