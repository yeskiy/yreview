package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TodoWordTest {

    @Test
    fun `reads the word of a todo line`() {
        assertEquals("TODO", TodoWord.of("TODO: drop this"))
    }

    @Test
    fun `reads the word of a fixme line`() {
        assertEquals("FIXME", TodoWord.of("FIXME the anchor moves"))
    }

    @Test
    fun `puts the word in capital letters`() {
        assertEquals("TODO", TodoWord.of("todo: drop this"))
    }

    @Test
    fun `passes the space in front of the word`() {
        assertEquals("TODO", TodoWord.of("   TODO drop this"))
    }

    @Test
    fun `gives nothing for a line that starts with a digit`() {
        assertNull(TodoWord.of("42 is the answer"))
    }

    @Test
    fun `gives nothing for an empty line`() {
        assertNull(TodoWord.of(""))
    }
}
