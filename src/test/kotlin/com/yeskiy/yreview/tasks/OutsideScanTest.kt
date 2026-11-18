package com.yeskiy.yreview.tasks

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.ideGitRunner
import java.io.File
import java.nio.file.Files

/** The tool window scan reads the open files outside the project. JUnit 3 finds a test by the prefix test. */
class OutsideScanTest : BasePlatformTestCase() {

    private val folders = mutableListOf<File>()

    private val service: ReviewService get() = ReviewService.getInstance(project)

    override fun setUp() {
        super.setUp()
        service.homeOverride = vfs(folder()).path
    }

    override fun tearDown() {
        try {
            FileEditorManager.getInstance(project).openFiles.forEach { FileEditorManager.getInstance(project).closeFile(it) }
            service.homeOverride = null
            folders.forEach { it.deleteRecursively() }
        } finally {
            super.tearDown()
        }
    }

    private fun folder(): File = Files.createTempDirectory("y-review-outside").toFile().also { folders.add(it) }

    private fun vfs(file: File): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!

    private fun comment(file: VirtualFile, text: String) {
        val anchor = (service.anchorOf(file) as AnchorResult.Found).anchor
        service.addComment(anchor, NoteRefs.LOCAL, Range(startLine = 1, endLine = 1), text)
    }

    private fun open(file: VirtualFile) {
        FileEditorManager.getInstance(project).openFile(file, false)
    }

    private fun outside(): List<RepositoryTasks> = TaskScan.read(project, null).filter { it.outside != null }

    fun testAnOutsideRepositoryGivesOnlyTheCommentsOfItsOpenFile() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            repo.commit("b.txt", "b\n")
            val a = vfs(File(repo.dir, "a.txt"))
            comment(a, "on a")
            comment(vfs(File(repo.dir, "b.txt")), "on b")
            open(a)

            val entries = outside()

            assertEquals(1, entries.size)
            assertEquals(vfs(repo.dir), entries[0].root)
            assertEquals(listOf("on a"), entries[0].tasks.map { it.text })
            assertTrue(entries[0].tasks.all { it.outside && it.path == "a.txt" })
        }
    }

    fun testALooseFileWithATodoLineGivesATodoTaskWithNoStore() {
        val dir = folder()
        val file = vfs(File(dir, "notes.txt").also { it.writeText("first\nTODO fix the loose file\n") })
        open(file)

        val entries = outside()

        assertEquals(1, entries.size)
        assertEquals(FolderStore.WORKTREE, entries[0].commit)
        val todo = entries[0].tasks.single()
        assertEquals(TaskKind.TODO, todo.kind)
        assertEquals("notes.txt", todo.path)
        assertEquals(2, todo.startLine)
        assertTrue(todo.outside)
        assertFalse(File(dir, FolderStore.FOLDER).exists())
    }

    fun testAnOutsideRootWithNoTaskGivesNoEntry() {
        open(vfs(File(folder(), "plain.txt").also { it.writeText("nothing here\n") }))

        assertEquals(emptyList<RepositoryTasks>(), outside())
    }

    fun testTheOpenTodosOfAnAgentReportLeaveOutAnOutsideFile() {
        open(vfs(File(folder(), "loose.txt").also { it.writeText("TODO not for the agent\n") }))

        assertEquals(1, outside().size)
        assertEquals(emptyList<ReviewTask>(), TaskScan.openTodos(project))
    }

    fun testTheDiagnosticCountNamesEachOutsideRootWithAnOpenFile() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            val a = vfs(File(repo.dir, "a.txt"))
            open(a)
            service.anchorOf(a)

            assertEquals(1, TaskScan.outsideCount(project))
        }
    }

    fun testGitStatusNamesOnlyTheChangedOpenFilesOfAnOutsideRepository() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            repo.commit("b [1].txt", "b\n")
            File(repo.dir, "a.txt").writeText("changed\n")
            File(repo.dir, "b [1].txt").writeText("changed\n")
            File(repo.dir, "new").mkdirs()
            File(repo.dir, "new/c.txt").writeText("c\n")
            val root = vfs(repo.dir)
            val status = ideGitRunner(project, root)
                .run(*ChangeListTab.statusArguments(listOf("b [1].txt", "new/c.txt")).toTypedArray())

            assertTrue(status.stderr, status.ok)
            assertEquals(setOf("${root.path}/b [1].txt", "${root.path}/new/c.txt"), ChangeListTab.statusFiles(root.path, status.stdout))
        }
    }

    fun testTheCurrentFileScanKeepsOnlyThatOutsideFile() {
        val dir = folder()
        val one = vfs(File(dir, "one.txt").also { it.writeText("TODO one\n") })
        val two = vfs(File(dir, "two.txt").also { it.writeText("TODO two\n") })
        open(one)
        open(two)

        val entries = TaskScan.read(project, two).filter { it.outside != null }

        assertEquals(listOf("two.txt"), entries.flatMap { it.tasks }.map { it.path })
    }
}
