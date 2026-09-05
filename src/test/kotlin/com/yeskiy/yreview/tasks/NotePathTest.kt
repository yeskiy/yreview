package com.yeskiy.yreview.tasks

import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.toolwindow.TaskNodes
import java.io.File

/**
 * The file that one tree row opens, against the file system of a real IDE.
 *
 * A note record comes from another person, and the path inside it can climb out of the
 * repository. These tests read what the platform really opens, because no reading of the
 * platform source can settle that question.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class NotePathTest : BasePlatformTestCase() {

    private lateinit var folder: File

    private lateinit var repository: File

    override fun setUp() {
        super.setUp()
        folder = FileUtil.createTempDirectory("yreview-note-path", null)
        repository = File(folder, "repo")
        File(repository, "src").mkdirs()
        File(repository, "src/Parser.kt").writeText("class Parser\n")
        File(folder, "secret.txt").writeText("the password of the user\n")
        LocalFileSystem.getInstance().refreshAndFindFileByIoFile(folder)
    }

    override fun tearDown() {
        try {
            FileUtil.delete(folder)
        } finally {
            super.tearDown()
        }
    }

    /** The task that the scan builds from one note record of this repository. */
    private fun task(notePath: String): ReviewTask = ReviewTask(
        id = "a1b2c3",
        kind = TaskKind.COMMENT,
        path = notePath,
        startLine = 1,
        endLine = 1,
        text = "look at this",
        filePath = "${root()}/$notePath",
        rootPath = root(),
    )

    /** The same text that the scan builds from the repository root of a note. */
    private fun root(): String = repository.path.replace('\\', '/')

    fun `test a note of this repository opens its file`() {
        val found = TaskNodes.find(task("src/Parser.kt"))

        assertNotNull("the fixture must open a file that stands inside the repository", found)
        assertEquals("Parser.kt", found!!.name)
    }

    fun `test a note that climbs out of the repository opens nothing`() {
        assertNull(TaskNodes.find(task("../secret.txt")))
        assertNull(TaskNodes.find(task("../../secret.txt")))
        assertNull(TaskNodes.find(task("src/../../secret.txt")))
    }

    fun `test a note that names a whole path of its own opens nothing`() {
        assertNull(TaskNodes.find(task(File(folder, "secret.txt").path.replace('\\', '/'))))
    }
}
