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

    /** The control sequence introducer in one character, which is U+009B. */
    private val introducer = Char(0x9b)

    /** One character of two code units, which is U+1F680. */
    private val wide = String(Character.toChars(0x1F680))

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
    fun `the second range of control characters goes out`() {
        // The second range of control characters runs from U+0080 to U+009F. A terminal
        // that reads the comment as UTF-8 acts on U+009B. That one character alone
        // starts a control sequence.
        assertEquals("ab", TaskText.of("a" + introducer + "b"))
        assertEquals("ab", TaskText.of("a" + Char(0x80) + Char(0x85) + Char(0x9f) + "b"))
        assertEquals("ab", TaskText.path("a" + introducer + "b"))
    }

    @Test
    fun `the character after that range stays`() {
        // U+00A0 is the no-break space, and U+00A1 is a mark of a sentence. Both print.
        val plain = "a" + Char(0xa0) + "b" + Char(0xa1)

        assertEquals(plain, TaskText.of(plain))
        assertEquals(plain, TaskText.path(plain))
    }

    @Test
    fun `the rule names every control character it drops`() {
        assertTrue(TaskText.isControl(escape))
        assertTrue(TaskText.isControl(Char(0)))
        assertTrue(TaskText.isControl(delete))
        assertTrue(TaskText.isControl(introducer))
        assertFalse(TaskText.isControl(Char(0xa0)))
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
        assertTrue(TaskText.isAnyControl(introducer))
        assertTrue(TaskText.isAnyControl(Char(0x80)))
        assertTrue(TaskText.isAnyControl(Char(0x9f)))
        assertFalse(TaskText.isAnyControl(Char(0xa0)))
        assertTrue(TaskText.isAnyControl('\n'))
        assertTrue(TaskText.isAnyControl('\r'))
        assertTrue(TaskText.isAnyControl('\t'))
        assertFalse(TaskText.isAnyControl('a'))
    }

    // --- The cut of a long text ---

    @Test
    fun `a cut keeps a character of two code units whole`() {
        // The cap counts code units, and this character takes two of them. A cut between
        // the two halves leaves a half that no encoder can write.
        assertEquals("ab", TaskText.cut("ab" + wide, 3))
        assertEquals("ab" + wide, TaskText.cut("ab" + wide, 4))
        assertEquals("ab" + wide, TaskText.cut("ab" + wide, 9))
    }

    @Test
    fun `a cut of a plain text takes the first characters`() {
        assertEquals("fix", TaskText.cut("fix the parser", 3))
        assertEquals("", TaskText.cut("fix the parser", 0))
        assertEquals("fix the parser", TaskText.cut("fix the parser", 200))
    }
}
