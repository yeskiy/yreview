package com.yeskiy.yreview.bridge

import com.yeskiy.yreview.ui.PlainText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OpenCodeTitleTest {

    private fun session(
        id: String,
        title: String,
        directory: String,
        updated: Long,
    ) = OpenCodeSession(id, title, directory, OpenCodeSession.Time(updated))

    @Test
    fun `the newest session of the directory names the tab`() {
        val rows = listOf(
            session("ses_a", "an old talk", "C:\\work\\app", 100),
            session("ses_b", "the live talk", "C:\\work\\app", 300),
            session("ses_c", "a middle talk", "C:\\work\\app", 200),
        )

        assertEquals("the live talk", OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `a session of another directory never names the tab`() {
        // The store of OpenCode is global, so the answer holds every directory.
        val rows = listOf(
            session("ses_a", "another project", "C:\\work\\other", 900),
            session("ses_b", "this project", "C:\\work\\app", 100),
        )

        assertEquals("this project", OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `one directory in two spellings is one directory`() {
        // The plugin writes a forward slash, and the server answers with a backslash.
        assertTrue(OpenCodeTitle.same("C:\\work\\app", "C:/work/app"))
        assertTrue(OpenCodeTitle.same("C:/work/app/", "C:/work/app"))
        assertTrue(OpenCodeTitle.same("c:/work/app", "C:/Work/App"))
        assertFalse(OpenCodeTitle.same("C:/work/app", "C:/work/app2"))
    }

    @Test
    fun `an empty title is no name`() {
        // A session that nobody named yet must leave the built name of the tab standing.
        val rows = listOf(session("ses_a", "   ", "C:/work/app", 100))

        assertNull(OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `an empty answer is no name`() {
        assertNull(OpenCodeTitle.pick(emptyList(), "C:/work/app"))
    }

    @Test
    fun `an answer with no row of this directory is no name`() {
        val rows = listOf(session("ses_a", "another project", "C:/work/other", 100))

        assertNull(OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `an answer of the real server parses`() {
        // One row of a real answer of OpenCode 1.18.27, cut to the fields that matter.
        val body = """
            [{"id":"ses_03adedcc9ffeOzIOhxpkTDNIR5","slug":"misty-orchid","projectID":"global",
              "directory":"C:\\Users\\eqwer","path":"Users/eqwer","cost":0,
              "tokens":{"input":13455,"output":10,"reasoning":0,"cache":{"read":128,"write":0}},
              "title":"Quick check-in","agent":"build",
              "model":{"id":"z-ai/glm-5.2","providerID":"nvidia"},"version":"1.18.4",
              "time":{"created":1785718711094,"updated":1785718727742}}]
        """.trimIndent()

        assertEquals("Quick check-in", OpenCodeTitle.pick(OpenCodeTitle.parse(body), "C:/Users/eqwer"))
    }

    @Test
    fun `a broken answer names nothing and throws nothing`() {
        assertEquals(emptyList(), OpenCodeTitle.parse("not json at all"))
        assertEquals(emptyList(), OpenCodeTitle.parse(""))
    }

    @Test
    fun `an answer of a shape this build does not know names nothing`() {
        // A later release of OpenCode can answer an object, or a list of other things.
        assertEquals(emptyList(), OpenCodeTitle.parse("""{"sessions":[{"title":"a talk"}]}"""))
        assertEquals(emptyList(), OpenCodeTitle.parse("[1,2,3]"))
        assertEquals(emptyList(), OpenCodeTitle.parse("[null]"))
        assertNull(OpenCodeTitle.pick(OpenCodeTitle.parse("""{"title":"a talk"}"""), "C:/work/app"))
    }

    @Test
    fun `a row that carries no title names nothing`() {
        // Every field has a default, so a row without the title field still parses.
        val rows = OpenCodeTitle.parse("""[{"id":"ses_a","directory":"C:/work/app"}]""")

        assertEquals(1, rows.size)
        assertNull(OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `a blank title of the newest session drops the name of the tab`() {
        // The newest row wins, and a blank name of that row leaves the built name standing.
        val rows = listOf(
            session("ses_a", "an old talk", "C:/work/app", 100),
            session("ses_b", "  ", "C:/work/app", 300),
        )

        assertNull(OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `a title that starts with the markup tag names nothing`() {
        // Swing draws such a text as markup, so the tab and the notice must not carry it.
        val rows = listOf(session("ses_a", "<html><b>owned</b>", "C:/work/app", 100))

        assertNull(OpenCodeTitle.pick(rows, "C:/work/app"))
    }

    @Test
    fun `a long title is cut`() {
        val rows = listOf(session("ses_a", "z".repeat(250), "C:/work/app", 100))

        val name = OpenCodeTitle.pick(rows, "C:/work/app")

        assertEquals("z".repeat(PlainText.LONGEST) + PlainText.MORE, name)
    }
}
