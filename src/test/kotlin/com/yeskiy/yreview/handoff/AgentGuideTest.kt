package com.yeskiy.yreview.handoff

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AgentGuideTest {

    private val lines = AgentGuide.TEXT.lines()

    @Test
    fun `stays under sixty lines`() {
        assertTrue(lines.size < 60, "the guide holds ${lines.size} lines")
    }

    @Test
    fun `names the two files the plugin writes`() {
        assertTrue(AgentGuide.TEXT.contains("tasks.json"))
        assertTrue(AgentGuide.TEXT.contains("done.txt"))
    }

    @Test
    fun `names every field of a task record`() {
        listOf("`id`", "`kind`", "`path`", "`startLine`", "`endLine`", "`text`", "`pattern`", "`author`")
            .forEach { field -> assertTrue(AgentGuide.TEXT.contains(field), "the guide misses $field") }
    }

    @Test
    fun `states the character set of an identifier`() {
        assertTrue(
            AgentGuide.TEXT.contains("letters, digits, underscores and hyphens only"),
            "the guide does not name the character set of an identifier",
        )
    }

    @Test
    fun `states that a todo closes when the line leaves the source`() {
        assertTrue(AgentGuide.TEXT.contains("Remove that comment line from the source file."))
    }

    @Test
    fun `states that the plugin reads the done file by itself`() {
        assertTrue(AgentGuide.TEXT.contains("The plugin picks up every new line by itself."))
    }

    @Test
    fun `warns before it names the reason`() {
        assertTrue(AgentGuide.TEXT.contains("Never delete `done.txt` and never edit it, because"))
    }

    @Test
    fun `holds no character the style rules ban`() {
        // The code points are the em dash, the en dash, and the four curly quotation marks.
        listOf(0x2014, 0x2013, 0x201C, 0x201D, 0x2018, 0x2019).forEach { code ->
            assertEquals(-1, AgentGuide.TEXT.indexOf(Char(code)), "the guide holds the code point $code")
        }
    }

    @Test
    fun `holds no contraction`() {
        listOf("don't", "doesn't", "isn't", "won't", "can't", "it's")
            .forEach { word -> assertTrue(!AgentGuide.TEXT.contains(word), "the guide holds $word") }
    }
}
