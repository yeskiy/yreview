package com.yeskiy.yreview.store

import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.TempRepo
import java.io.File
import java.nio.file.Files

/** Files outside the project find their store the way git finds a repository. JUnit 3 finds a test by the prefix test. */
class LooseAnchorTest : BasePlatformTestCase() {

    private val folders = mutableListOf<File>()

    private val service: ReviewService get() = ReviewService.getInstance(project)

    override fun setUp() {
        super.setUp()
        service.homeOverride = vfs(folder()).path
    }

    override fun tearDown() {
        try {
            service.homeOverride = null
            folders.forEach { it.deleteRecursively() }
        } finally {
            super.tearDown()
        }
    }

    private fun folder(): File = Files.createTempDirectory("y-review-loose").toFile().also { folders.add(it) }

    private fun vfs(file: File): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!

    private fun write(dir: File, name: String): VirtualFile =
        vfs(File(dir, name).also { it.parentFile.mkdirs(); it.writeText("x\n") })

    fun testALooseFileGetsAFolderStoreNextToIt() {
        val dir = folder()
        val file = write(dir, "f.txt")

        val found = service.anchorOf(file) as AnchorResult.Found

        assertEquals(ReviewAnchor(StoreKind.FOLDER, vfs(dir), FolderStore.WORKTREE, "f.txt"), found.anchor)
    }

    fun testAFileOfARepositoryOutsideTheProjectGoesToItsNotes() {
        TempRepo().use { repo ->
            File(repo.dir, "a").mkdirs()
            val head = repo.commit("a/f.txt", "x\n")
            val file = vfs(File(repo.dir, "a/f.txt"))

            val found = service.anchorOf(file) as AnchorResult.Found

            assertEquals(ReviewAnchor(StoreKind.GIT, vfs(repo.dir), head, "a/f.txt"), found.anchor)
            assertEquals(StoreKind.GIT, service.storeAt(vfs(repo.dir)).kind)
            assertEquals("a/f.txt", service.relativePath(file))
            assertEquals(vfs(repo.dir), service.repositoryRoot(file))
        }
    }

    fun testARepositoryWithNoCommitAndNoStoreGivesNoCommit() {
        TempRepo().use { repo ->
            val file = write(repo.dir, "f.txt")

            assertEquals(AnchorResult.NoCommit, service.anchorOf(file))
        }
    }

    fun testAFileDirectlyInHomeGetsTheHomeMessage() {
        val file = write(File(service.home()!!), "f.txt")

        assertEquals(AnchorResult.HomeFile, service.anchorOf(file))
    }

    fun testTheCachedAnswerNeedsAnEarlierRead() {
        val file = write(folder(), "f.txt")

        assertNull(service.anchorOfCached(file))
        val found = service.anchorOf(file)
        assertEquals(found, service.anchorOfCached(file))
    }

    fun testALooseRootIsNotAProjectRoot() {
        val dir = folder()
        val found = service.anchorOf(write(dir, "f.txt")) as AnchorResult.Found

        assertFalse(service.isProjectRoot(found.anchor.root.path))
    }
}
