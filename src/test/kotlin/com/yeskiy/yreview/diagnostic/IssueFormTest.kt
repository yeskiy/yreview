package com.yeskiy.yreview.diagnostic

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The error dialog opens a form in the browser. The address carries the text, so the text
 * must stay under the cap of a browser, and it must carry no private value.
 */
class IssueFormTest {

    private val base = "https://github.com/yeskiy/yreview/issues/new"

    private val stack = listOf(
        "java.io.IOException: the disk is full\n" +
            "\tat com.yeskiy.yreview.store.NotesGateway.append(NotesGateway.kt:41)\n" +
            "\tat com.yeskiy.yreview.store.CommentBook.add(CommentBook.kt:22)"
    )

    @Test
    fun `the title names the type and the message`() {
        assertEquals("IOException: the disk is full", IssueForm.title("IOException", "the disk is full"))
    }

    @Test
    fun `the title of an empty message names the type alone`() {
        assertEquals("IOException", IssueForm.title("IOException", ""))
    }

    @Test
    fun `the title stays on one line`() {
        assertEquals("IOException: first", IssueForm.title("IOException", "first\nsecond"))
    }

    @Test
    fun `the body carries the words of the reporter and the stack`() {
        val body = IssueForm.body("the send did nothing", stack, "Yreview diagnostic report")

        assertTrue(body.contains("the send did nothing"), body)
        assertTrue(body.contains("NotesGateway.append"), body)
        assertTrue(body.contains("Yreview diagnostic report"), body)
    }

    @Test
    fun `the body says that the reporter wrote nothing`() {
        assertTrue(IssueForm.body(null, stack, "head").contains("The reporter wrote nothing here."))
    }

    @Test
    fun `the body cuts a long stack`() {
        val long = List(200) { "\tat com.yeskiy.yreview.Frame$it.run(Frame.kt:$it)" }.joinToString("\n")

        val kept = IssueForm.body(null, listOf(long), "head").lines().count { it.startsWith("\tat ") }

        assertEquals(IssueForm.STACK_LINES, kept)
    }

    @Test
    fun `the body carries no private value`() {
        val body = IssueForm.body(
            "it failed on git@github.com:alice-corp/app.git for alice@example.com",
            listOf("java.io.IOException: token=9f8e7d6c5b4a39281706f5e4d3c2b1a0"),
            "head",
        )

        assertFalse(body.contains("alice"), body)
        assertFalse(body.contains("9f8e7d6c5b4a39281706f5e4d3c2b1a0"), body)
    }

    @Test
    fun `a short form carries the text in the address`() {
        val form = IssueForm.form(base, "IOException", IssueForm.body(null, stack, "head"))

        assertTrue(form.prefilled)
        assertTrue(form.url.startsWith("$base?title="), form.url)
        assertTrue(form.url.length <= IssueForm.MAX_URL, "${form.url.length} characters")
    }

    @Test
    fun `a long form gives the plain address back`() {
        val form = IssueForm.form(base, "IOException", "x".repeat(IssueForm.MAX_URL))

        assertFalse(form.prefilled, "a browser drops the tail of a long address without a word")
        assertEquals(base, form.url)
    }
}
