package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TaskTreeTest {

    private fun task(
        id: String,
        path: String,
        line: Int,
        kind: TaskKind = TaskKind.TODO,
        filePath: String = "/repo/$path",
        rootPath: String = "/repo",
    ) = ReviewTask(
        id = id,
        kind = kind,
        path = path,
        startLine = line,
        endLine = line,
        text = "work on $id",
        filePath = filePath,
        rootPath = rootPath,
    )

    @Test
    fun `puts the tasks of one file under one group`() {
        val groups = TaskTree.group(listOf(task("a", "src/A.kt", 4), task("b", "src/A.kt", 9)))
        assertEquals(1, groups.size)
        assertEquals("src/A.kt", groups.single().path)
        assertEquals(listOf("a", "b"), groups.single().tasks.map { it.id })
    }

    @Test
    fun `sorts the files by path`() {
        val groups = TaskTree.group(listOf(task("a", "src/Z.kt", 1), task("b", "src/A.kt", 1)))
        assertEquals(listOf("src/A.kt", "src/Z.kt"), groups.map { it.path })
    }

    @Test
    fun `sorts the tasks of a file by line`() {
        val groups = TaskTree.group(listOf(task("a", "src/A.kt", 90), task("b", "src/A.kt", 12)))
        assertEquals(listOf("b", "a"), groups.single().tasks.map { it.id })
    }

    @Test
    fun `keeps one row for a task that arrives twice`() {
        val groups = TaskTree.group(listOf(task("a", "src/A.kt", 4), task("a", "src/A.kt", 4)))
        assertEquals(1, groups.single().tasks.size)
    }

    @Test
    fun `keeps two files that share a relative path`() {
        val groups = TaskTree.group(
            listOf(
                task("a", "src/A.kt", 4, filePath = "/one/src/A.kt", rootPath = "/one"),
                task("a", "src/A.kt", 4, filePath = "/two/src/A.kt", rootPath = "/two"),
            )
        )
        assertEquals(2, groups.single().tasks.size)
    }

    @Test
    fun `groups by the label the caller gives`() {
        val groups = TaskTree.group(
            listOf(
                task("a", "src/A.kt", 4, rootPath = "/one"),
                task("b", "src/A.kt", 4, rootPath = "/two"),
            )
        ) { "${it.rootPath}/${it.path}" }
        assertEquals(listOf("/one/src/A.kt", "/two/src/A.kt"), groups.map { it.path })
    }

    @Test
    fun `flattens the groups back into the tasks`() {
        val groups = TaskTree.group(listOf(task("a", "src/Z.kt", 1), task("b", "src/A.kt", 1)))
        assertEquals(listOf("b", "a"), TaskTree.flatten(groups).map { it.id })
    }

    @Test
    fun `makes no group from no task`() {
        assertTrue(TaskTree.group(emptyList()).isEmpty())
    }
}
