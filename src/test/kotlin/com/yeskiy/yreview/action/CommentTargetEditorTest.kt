package com.yeskiy.yreview.action

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.Range

/**
 * The read of one selection of a real editor.
 *
 * [CommentRangeTest] holds the rule itself. These tests prove the arithmetic that turns the
 * offsets of a document into the numbers of that rule.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class CommentTargetEditorTest : BasePlatformTestCase() {

    private val text = "val answer = 42\nval other = 1\n"

    fun `test a word of one line carries its characters`() {
        myFixture.configureByText("a.txt", text)
        myFixture.editor.selectionModel.setSelection(0, 10)

        assertEquals(
            Range(startLine = 1, startColumn = 0, endLine = 1, endColumn = 10),
            CommentTarget.fromEditor(myFixture.editor, "a.txt").range,
        )
    }

    fun `test a selection of the whole text of a line carries no character`() {
        myFixture.configureByText("a.txt", text)
        myFixture.editor.selectionModel.setSelection(0, 15)

        assertEquals(
            Range(startLine = 1, endLine = 1),
            CommentTarget.fromEditor(myFixture.editor, "a.txt").range,
        )
    }

    fun `test a caret carries no character`() {
        myFixture.configureByText("a.txt", text)
        myFixture.editor.caretModel.moveToOffset(5)

        assertEquals(
            Range(startLine = 1, endLine = 1),
            CommentTarget.fromEditor(myFixture.editor, "a.txt").range,
        )
    }

    fun `test a selection of two whole lines carries no character`() {
        myFixture.configureByText("a.txt", text)
        myFixture.editor.selectionModel.setSelection(0, 16)

        assertEquals(
            Range(startLine = 1, endLine = 2),
            CommentTarget.fromEditor(myFixture.editor, "a.txt").range,
        )
    }

    fun `test a selection over two lines carries both characters`() {
        myFixture.configureByText("a.txt", text)
        myFixture.editor.selectionModel.setSelection(4, 20)

        assertEquals(
            Range(startLine = 1, startColumn = 4, endLine = 2, endColumn = 4),
            CommentTarget.fromEditor(myFixture.editor, "a.txt").range,
        )
    }
}
