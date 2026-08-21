package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals

class TodoCutTest {

    /** Removes one comment from a text, the way the write command action does it. */
    private fun cut(text: String, comment: String): String {
        val start = text.indexOf(comment)
        val range = TodoCut.of(text, start, start + comment.length)
        return text.removeRange(range.start, range.end)
    }

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
}
