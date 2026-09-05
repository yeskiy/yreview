package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A person pastes the prompt into a terminal, so an escape sequence inside a comment must
 * not reach that terminal.
 */
class TaskTextTest {

    private val escape = Char(27)

    private val bell = Char(7)

    private val delete = Char(127)

    @Test
    fun `a plain text stays as it is`() {
        assertEquals("fix the parser", TaskText.of("fix the parser"))
    }

    @Test
    fun `an escape sequence goes out`() {
        assertEquals("[31mred[0m", TaskText.of("$escape[31mred$escape[0m"))
    }

    @Test
    fun `the lines of a comment stay whole`() {
        val text = listOf("one", "two", "three").joinToString("\n") + "\r\n" + "four\tfive"

        assertEquals(text, TaskText.of(text))
    }

    @Test
    fun `the bell and the delete character go out`() {
        assertEquals("ab", TaskText.of("a" + bell + delete + "b"))
    }

    @Test
    fun `the rule names every control character it drops`() {
        assertTrue(TaskText.isControl(escape))
        assertTrue(TaskText.isControl(Char(0)))
        assertTrue(TaskText.isControl(delete))
        assertFalse(TaskText.isControl('\n'))
        assertFalse(TaskText.isControl('\r'))
        assertFalse(TaskText.isControl('\t'))
        assertFalse(TaskText.isControl('a'))
    }

    @Test
    fun `a path keeps no control character at all`() {
        assertEquals("src/Parser.kt", TaskText.path("src/\tParser\r\n.kt"))
        assertEquals("srcab", TaskText.path("src" + escape + "a" + bell + delete + "b"))
    }

    @Test
    fun `the strict rule names every control character`() {
        assertTrue(TaskText.isAnyControl(escape))
        assertTrue(TaskText.isAnyControl(Char(0)))
        assertTrue(TaskText.isAnyControl(delete))
        assertTrue(TaskText.isAnyControl('\n'))
        assertTrue(TaskText.isAnyControl('\r'))
        assertTrue(TaskText.isAnyControl('\t'))
        assertFalse(TaskText.isAnyControl('a'))
    }
}
