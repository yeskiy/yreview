package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TaskLayoutTest {

    private fun task(
        id: String,
        path: String,
        line: Int = 1,
        module: String = "",
        kind: TaskKind = TaskKind.TODO,
    ) = ReviewTask(
        id = id,
        kind = kind,
        path = path,
        startLine = line,
        endLine = line,
        text = "work on $id",
        filePath = "/repo/$path",
        rootPath = "/repo",
        module = module,
    )

    private fun groups(vararg tasks: ReviewTask) = TaskTree.group(tasks.toList())

    private val flat = TaskGrouping()

    private val byDirectory = TaskGrouping(byDirectory = true)

    @Test
    fun `keeps the files at the top when no toggle is on`() {
        val layout = TaskTree.layout(groups(task("a", "src/A.kt"), task("b", "web/B.kt")), flat)

        assertTrue(layout.folders.isEmpty())
        assertEquals(listOf("src/A.kt", "web/B.kt"), layout.files.map { it.path })
        assertEquals(listOf("src/A.kt", "web/B.kt"), layout.files.map { it.name })
    }

    @Test
    fun `a layout of no task holds no row`() {
        assertEquals(0, TaskTree.layout(emptyList(), flat).rows)
    }

    @Test
    fun `a flat layout counts one row for each file`() {
        assertEquals(2, TaskTree.layout(groups(task("a", "src/A.kt"), task("b", "web/B.kt")), flat).rows)
    }

    @Test
    fun `a layout counts a folder row and a file row of the root together`() {
        assertEquals(2, TaskTree.layout(groups(task("a", "src/A.kt"), task("b", "README.md")), byDirectory).rows)
    }

    @Test
    fun `puts the files under their module`() {
        val layout = TaskTree.layout(
            groups(task("a", "src/A.kt", module = "core"), task("b", "web/B.kt", module = "app")),
            TaskGrouping(byModule = true),
        )

        assertEquals(listOf("app", "core"), layout.folders.map { it.name })
        assertEquals(listOf(FolderKind.MODULE, FolderKind.MODULE), layout.folders.map { it.kind })
        assertEquals(listOf("web/B.kt"), layout.folders.first().files.map { it.path })
        assertTrue(layout.files.isEmpty())
    }

    @Test
    fun `leaves a file with no module at the top`() {
        val layout = TaskTree.layout(
            groups(task("a", "src/A.kt", module = "core"), task("b", "notes.md")),
            TaskGrouping(byModule = true),
        )

        assertEquals(listOf("core"), layout.folders.map { it.name })
        assertEquals(listOf("notes.md"), layout.files.map { it.path })
    }

    @Test
    fun `builds one folder row for each directory segment`() {
        val layout = TaskTree.layout(groups(task("a", "src/main/A.kt")), byDirectory)

        val src = layout.folders.single()
        assertEquals("src", src.name)
        assertEquals(FolderKind.DIRECTORY, src.kind)
        val main = src.folders.single()
        assertEquals("main", main.name)
        assertEquals(listOf("src/main/A.kt"), main.files.map { it.path })
    }

    @Test
    fun `shows the file name only under a directory row`() {
        val layout = TaskTree.layout(groups(task("a", "src/main/A.kt")), byDirectory)

        assertEquals(listOf("A.kt"), layout.folders.single().folders.single().files.map { it.name })
    }

    @Test
    fun `keeps a file of the root beside the directory rows`() {
        val layout = TaskTree.layout(groups(task("a", "src/A.kt"), task("b", "README.md")), byDirectory)

        assertEquals(listOf("src"), layout.folders.map { it.name })
        assertEquals(listOf("README.md"), layout.files.map { it.path })
    }

    @Test
    fun `puts the whole directory path on one row when the tree is flat`() {
        val layout = TaskTree.layout(
            groups(task("a", "src/main/A.kt"), task("b", "src/main/B.kt"), task("c", "src/test/C.kt")),
            TaskGrouping(byDirectory = true, flatten = true),
        )

        assertEquals(listOf("src/main", "src/test"), layout.folders.map { it.name })
        assertTrue(layout.folders.all { it.folders.isEmpty() })
        assertEquals(listOf("A.kt", "B.kt"), layout.folders.first().files.map { it.name })
    }

    @Test
    fun `ignores the flatten toggle while the directory toggle is off`() {
        val layout = TaskTree.layout(groups(task("a", "src/main/A.kt")), TaskGrouping(flatten = true))

        assertTrue(layout.folders.isEmpty())
        assertEquals(listOf("src/main/A.kt"), layout.files.map { it.path })
    }

    @Test
    fun `puts the directory rows under the module row`() {
        val layout = TaskTree.layout(
            groups(task("a", "src/main/A.kt", module = "core")),
            TaskGrouping(byModule = true, byDirectory = true),
        )

        val module = layout.folders.single()
        assertEquals("core", module.name)
        assertEquals("src", module.folders.single().name)
        assertEquals(listOf("A.kt"), module.folders.single().folders.single().files.map { it.name })
    }

    @Test
    fun `counts every task under a folder row`() {
        val layout = TaskTree.layout(
            groups(task("a", "src/main/A.kt"), task("b", "src/main/A.kt", line = 9), task("c", "src/test/C.kt")),
            byDirectory,
        )

        assertEquals(3, TaskTree.tasksOf(layout.folders.single()).size)
        assertEquals("3 tasks", TaskLabels.folderCount(layout.folders.single()))
        assertEquals("src", TaskLabels.folderTitle(layout.folders.single()))
    }

    @Test
    fun `reads every task of the layout back in row order`() {
        val layout = TaskTree.layout(groups(task("a", "src/A.kt"), task("b", "README.md")), byDirectory)

        assertEquals(listOf("a", "b"), TaskTree.tasksOf(layout).map { it.id })
    }

    @Test
    fun `makes an empty layout from no task`() {
        val layout = TaskTree.layout(emptyList(), TaskGrouping(byModule = true, byDirectory = true))

        assertTrue(layout.folders.isEmpty())
        assertTrue(layout.files.isEmpty())
        assertTrue(TaskTree.tasksOf(layout).isEmpty())
    }

    // --- A path that another person wrote ---

    @Test
    fun `a path of many folders stops at the depth cap`() {
        val layout = TaskTree.layout(groups(task("a", deepPath(20_000))), byDirectory)

        assertEquals(TaskTree.MAX_DEPTH, depthOf(layout))
        assertEquals(listOf("a"), TaskTree.tasksOf(layout).map { it.id }, "the task keeps its row")
    }

    @Test
    fun `the row at the depth cap shows the rest of the path`() {
        val layout = TaskTree.layout(groups(task("a", deepPath(TaskTree.MAX_DEPTH + 2))), byDirectory)

        assertEquals(listOf("d/d/A.kt"), deepest(layout).files.map { it.name })
    }

    /** A path of [folders] folders, each one named the same, with one file at the end. */
    private fun deepPath(folders: Int): String = List(folders) { "d" }.joinToString("/") + "/A.kt"

    private fun depthOf(layout: TaskLayout): Int = layout.folders.maxOfOrNull { depthOf(it) } ?: 0

    private fun depthOf(folder: TaskFolder): Int = 1 + (folder.folders.maxOfOrNull { depthOf(it) } ?: 0)

    private fun deepest(layout: TaskLayout): TaskFolder = deepest(layout.folders.single())

    private fun deepest(folder: TaskFolder): TaskFolder =
        folder.folders.singleOrNull()?.let { deepest(it) } ?: folder
}
