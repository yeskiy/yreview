package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals

class TaskLabelsTest {

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
        assertEquals("88-94: first line", TaskLabels.taskTitle(comment))
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
    fun `shows no tail for a todo of one line`() {
        assertEquals("", TaskLabels.taskTail(todo))
    }

    @Test
    fun `shows the lines after the first one`() {
        val long = todo.copy(text = listOf("TODO: drop this", "after the release", "of the parser").joinToString("\n"))
        assertEquals("12: TODO: drop this", TaskLabels.taskTitle(long))
        assertEquals("after the release of the parser", TaskLabels.taskTail(long))
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
}
