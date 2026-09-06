package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TodoCutTest {

    /** Removes one comment from a text, the way the write command action does it. */
    private fun cut(text: String, comment: String): String {
        val start = text.indexOf(comment)
        val range = TodoCut.of(text, start, start + comment.length)
        return text.removeRange(range.start, range.end)
    }

    /**
     * Removes the lines of one row of the tree, and answers null when the row stays.
     *
     * [first] and [last] are the lines the row covers, counted from zero.
     */
    private fun rowCut(text: String, comment: String, first: Int, last: Int): String? {
        val cut = rowOf(text, comment, first, last) ?: return null
        return text.removeRange(cut.start, cut.end)
    }

    private fun rowOf(text: String, comment: String, first: Int, last: Int): TextCut? {
        val start = text.indexOf(comment)
        return TodoCut.row(text, start, start + comment.length, lineStart(text, first), lineEnd(text, last))
    }

    private fun lineStart(text: String, line: Int): Int =
        text.lineSequence().take(line).sumOf { it.length + 1 }

    private fun lineEnd(text: String, line: Int): Int =
        lineStart(text, line) + text.lineSequence().elementAt(line).length

    @Test
    fun `a comment alone on its line takes the whole line`() {
        val text = "fun a() {\n    // TODO: drop this\n    work()\n}\n"

        assertEquals("fun a() {\n    work()\n}\n", cut(text, "// TODO: drop this"))
    }

    @Test
    fun `a comment alone on its line leaves no blank line`() {
        val text = "a()\n// TODO: drop this\nb()\n"

        assertEquals("a()\nb()\n", cut(text, "// TODO: drop this"))
    }

    @Test
    fun `a comment on the first line takes that line`() {
        val text = "// TODO: drop this\nwork()\n"

        assertEquals("work()\n", cut(text, "// TODO: drop this"))
    }

    @Test
    fun `a comment on the last line without a line break takes that line`() {
        val text = "work()\n// TODO: drop this"

        assertEquals("work()\n", cut(text, "// TODO: drop this"))
    }

    @Test
    fun `a comment that follows code keeps the code`() {
        val text = "val x = 1   // TODO: drop this\nwork()\n"

        assertEquals("val x = 1\nwork()\n", cut(text, "// TODO: drop this"))
    }

    @Test
    fun `a comment in front of code keeps the code and the indent`() {
        val text = "    /* TODO: drop this */ work()\n"

        assertEquals("    work()\n", cut(text, "/* TODO: drop this */"))
    }

    @Test
    fun `a comment between code keeps both sides`() {
        val text = "a(/* TODO: drop this */ b)\n"

        assertEquals("a( b)\n", cut(text, "/* TODO: drop this */"))
    }

    @Test
    fun `a block comment over several lines takes every line`() {
        val text = "a()\n  /* TODO: one\n     two */\nb()\n"

        assertEquals("a()\nb()\n", cut(text, "/* TODO: one\n     two */"))
    }

    @Test
    fun `the cut of one whole line names the offsets of that line`() {
        val text = "a()\n// TODO: x\nb()\n"

        assertEquals(TextCut(4, 15), TodoCut.of(text, 4, 14))
    }

    @Test
    fun `two cuts of one file run from the last one to the first one`() {
        val text = "// TODO: one\nwork()\n// TODO: two\n"
        val first = TodoCut.of(text, 0, 12)
        val second = TodoCut.of(text, 20, 32)

        val left = TodoCut.apart(listOf(first, second))
            .fold(text) { kept, cut -> kept.removeRange(cut.start, cut.end) }

        assertEquals(listOf(second, first), TodoCut.apart(listOf(first, second)))
        assertEquals("work()\n", left)
    }

    @Test
    fun `two cuts that lie over each other become one`() {
        val one = TextCut(10, 40)
        val inside = TextCut(20, 30)

        assertEquals(listOf(one), TodoCut.apart(listOf(one, inside)))
        assertEquals(listOf(one), TodoCut.apart(listOf(one, one)))
        assertEquals(listOf(TextCut(10, 45)), TodoCut.apart(listOf(one, TextCut(20, 45))))
    }

    @Test
    fun `two cuts that touch each other both stay`() {
        val first = TextCut(0, 10)
        val second = TextCut(10, 20)

        assertEquals(listOf(second, first), TodoCut.apart(listOf(first, second)))
    }

    // --- The lines of one row ---

    private val doc = "/**\n * Docs\n * TODO: fix this\n * More docs\n */\nfun a() {}\n"

    @Test
    fun `a row inside a comment takes the line of the row only`() {
        assertEquals(
            "/**\n * Docs\n * More docs\n */\nfun a() {}\n",
            rowCut(doc, doc.substringBefore("\nfun"), 2, 2),
        )
    }

    @Test
    fun `a row over several lines takes every one of them`() {
        val text = "/**\n * Docs\n * TODO: fix this\n *     and this too\n */\n"

        assertEquals("/**\n * Docs\n */\n", rowCut(text, text.trimEnd('\n'), 2, 3))
    }

    @Test
    fun `a documentation tag inside the lines of the row goes with the row`() {
        val text = "/**\n * TODO: fix this\n *   @param name the name\n * More docs\n */\n"

        assertEquals("/**\n * More docs\n */\n", rowCut(text, text.trimEnd('\n'), 1, 2))
    }

    @Test
    fun `a row that fills the whole comment takes the whole comment`() {
        val text = "/**\n * TODO: fix this\n */\nfun a() {}\n"

        assertEquals("fun a() {}\n", rowCut(text, text.substringBefore("\nfun"), 1, 1))
    }

    @Test
    fun `a row on the line that opens the comment leaves the comment alone`() {
        val text = "/* TODO: fix this\n   another note */\nfun a() {}\n"

        assertNull(rowOf(text, text.substringBefore("\nfun"), 0, 0))
    }

    @Test
    fun `a row on the line that closes the comment leaves the comment alone`() {
        val text = "/* another note\n   TODO: fix this */\nfun a() {}\n"

        assertNull(rowOf(text, text.substringBefore("\nfun"), 1, 1))
    }

    @Test
    fun `a row of a comment alone on its line still takes the whole line`() {
        val text = "fun a() {\n    // TODO: drop this\n    work()\n}\n"

        assertEquals("fun a() {\n    work()\n}\n", rowCut(text, "// TODO: drop this", 1, 1))
    }

    @Test
    fun `a row of a comment that follows code still keeps the code`() {
        val text = "val x = 1   // TODO: drop this\nwork()\n"

        assertEquals("val x = 1\nwork()\n", rowCut(text, "// TODO: drop this", 0, 0))
    }
}
