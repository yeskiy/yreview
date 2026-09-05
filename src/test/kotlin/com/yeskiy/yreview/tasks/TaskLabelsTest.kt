package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TaskLabelsTest {

    private val escape = Char(27)

    private val comment = ReviewTask(
        id = "a1b2c3",
        kind = TaskKind.COMMENT,
        path = "src/main/kotlin/Parser.kt",
        startLine = 88,
        endLine = 94,
        text = "first line\nsecond line",
        state = "local",
    )

    private val todo = ReviewTask(
        id = "todo-abc-12",
        kind = TaskKind.TODO,
        path = "src/main/kotlin/Parser.kt",
        startLine = 12,
        endLine = 12,
        text = "TODO: drop this",
        pattern = "TODO",
    )

    @Test
    fun `shows one line number when the task holds one line`() {
        assertEquals("12", TaskLabels.lines(todo))
    }

    @Test
    fun `shows the range when the task holds several lines`() {
        assertEquals("88-94", TaskLabels.lines(comment))
    }

    @Test
    fun `shows the first line of the text after the line number`() {
        assertEquals("88-94: first line...", TaskLabels.taskTitle(comment))
    }

    @Test
    fun `shows how a comment is stored`() {
        assertEquals("local", TaskLabels.taskState(comment))
    }

    @Test
    fun `shows the word of a todo`() {
        assertEquals("TODO", TaskLabels.taskState(todo))
    }

    @Test
    fun `names the file and the count of a group`() {
        val group = TaskGroup("src/main/kotlin/Parser.kt", listOf(comment, todo))
        assertEquals("src/main/kotlin/Parser.kt", TaskLabels.fileTitle(group))
        assertEquals("2 tasks", TaskLabels.fileCount(group))
    }

    @Test
    fun `names one task in the singular`() {
        assertEquals("1 task", TaskLabels.fileCount(TaskGroup("a", listOf(todo))))
    }

    @Test
    fun `names one row of a directory tree by its file name`() {
        val group = TaskGroup("src/main/kotlin/Parser.kt", listOf(comment), name = "Parser.kt")
        assertEquals("Parser.kt", TaskLabels.fileTitle(group))
    }

    @Test
    fun `names a folder and counts every task under it`() {
        val folder = TaskFolder(
            "core",
            FolderKind.MODULE,
            files = listOf(TaskGroup("src/main/kotlin/Parser.kt", listOf(comment, todo))),
        )
        assertEquals("core", TaskLabels.folderTitle(folder))
        assertEquals("2 tasks", TaskLabels.folderCount(folder))
    }

    @Test
    fun `keeps a short line of one line whole`() {
        assertEquals("12: TODO: drop this", TaskLabels.taskTitle(todo))
        assertEquals("TODO: drop this", TaskLabels.rowText(todo.text))
    }

    @Test
    fun `keeps the first line only when the text holds several lines`() {
        val long = todo.copy(text = listOf("TODO: drop this", "after the release", "of the parser").joinToString("\n"))

        assertEquals("12: TODO: drop this...", TaskLabels.taskTitle(long))
    }

    @Test
    fun `cuts a line that is longer than the row limit`() {
        val long = "x".repeat(TaskLabels.ROW_LIMIT + 40)

        val row = TaskLabels.rowText(long)

        assertEquals("x".repeat(TaskLabels.ROW_LIMIT) + TaskLabels.MORE, row)
        assertEquals(TaskLabels.ROW_LIMIT + TaskLabels.MORE.length, row.length)
    }

    @Test
    fun `keeps a line of the length of the row limit whole`() {
        val edge = "y".repeat(TaskLabels.ROW_LIMIT)

        assertEquals(edge, TaskLabels.rowText(edge))
    }

    @Test
    fun `puts no line break in a row`() {
        val row = TaskLabels.rowText("first line\nsecond line")

        assertEquals("first line...", row)
        assertFalse(row.contains("\n"))
    }

    @Test
    fun `drops the blank lines in front of the text`() {
        assertEquals("first line...", TaskLabels.rowText("\n   \nfirst line\nsecond line"))
        assertEquals("first line", TaskLabels.firstLine("\n   \n  first line  \n"))
        assertEquals("", TaskLabels.firstLine("   "))
    }

    @Test
    fun `the clipboard keeps the whole text of a long comment`() {
        val long = comment.copy(text = "${"z".repeat(TaskLabels.ROW_LIMIT + 40)}\nsecond line")

        assertTrue(TaskLabels.plainText(long).contains("z".repeat(TaskLabels.ROW_LIMIT + 40)))
        assertTrue(TaskLabels.plainText(long).contains("second line"))
    }

    @Test
    fun `the tooltip names the place and holds every line`() {
        val tooltip = TaskLabels.taskTooltip(comment)

        assertTrue(tooltip.contains("src/main/kotlin/Parser.kt:88-94"))
        assertTrue(tooltip.contains("first line"))
        assertTrue(tooltip.contains("second line"))
        assertTrue(tooltip.contains("<br/>"))
    }

    @Test
    fun `the tooltip escapes the markup of the text`() {
        val tricky = comment.copy(text = "drop <b>this</b> & that")

        val tooltip = TaskLabels.taskTooltip(tricky)

        assertFalse(tooltip.contains("<b>this</b>"))
        assertTrue(tooltip.contains("&lt;b&gt;this&lt;/b&gt;"))
        assertTrue(tooltip.contains("&amp;"))
    }

    @Test
    fun `writes the whole identifier in the plain text`() {
        assertEquals(
            "a1b2c3 comment src/main/kotlin/Parser.kt:88-94\nfirst line\nsecond line",
            TaskLabels.plainText(comment),
        )
    }

    @Test
    fun `names the kind of a todo in the plain text`() {
        assertEquals(
            "todo-abc-12 todo src/main/kotlin/Parser.kt:12\nTODO: drop this",
            TaskLabels.plainText(todo),
        )
    }

    @Test
    fun `the clipboard text carries no escape sequence`() {
        val text = TaskLabels.plainText(comment.copy(text = "red" + escape + "[31m alert"))

        assertFalse(text.contains(escape), text)
        assertTrue(text.contains("red[31m alert"), text)
    }

    @Test
    fun `the clipboard text keeps the lines of the comment`() {
        assertTrue(TaskLabels.plainText(comment).contains("first line\nsecond line"))
    }

    @Test
    fun `the clipboard text carries no control character in the path`() {
        // The path comes from the note record, exactly as the text does.
        val tricky = comment.copy(path = "src/Parser.kt" + escape + "[31m\r\nrm -rf /")

        val text = TaskLabels.plainText(tricky)

        assertFalse(text.contains(escape), text)
        assertEquals(
            "a1b2c3 comment src/Parser.kt[31mrm -rf /:88-94\nfirst line\nsecond line",
            text,
        )
    }
}
