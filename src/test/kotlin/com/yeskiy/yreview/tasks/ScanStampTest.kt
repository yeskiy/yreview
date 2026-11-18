package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.GitDirs
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.ProcessGitRunner
import com.yeskiy.yreview.store.StoreRules
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScanStampTest {

    private fun stamp(repo: TempRepo, folder: File? = null, outside: List<String> = emptyList()): ScanStamp = ScanStamp.build(
        heads = mapOf(repo.dir.path to repo.git.run("rev-parse", "HEAD").stdout.trim()),
        gitRoots = listOf(repo.dir.path),
        folderRoots = listOfNotNull(folder?.path),
        outside = outside,
    )

    @Test
    fun `two stamps of an unchanged project match`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            assertTrue(stamp(repo).sure)
            assertTrue(stamp(repo).matches(stamp(repo)))
        }
    }

    @Test
    fun `a note write outside the IDE changes the stamp`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "one")
            val before = stamp(repo)
            check(repo.git.run("notes", "--ref", NoteRefs.LOCAL, "append", "-m", "note", commit).ok)
            assertFalse(before.matches(stamp(repo)))
        }
    }

    @Test
    fun `a new commit changes the stamp`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val before = stamp(repo)
            repo.commit("b.txt", "two")
            assertFalse(before.matches(stamp(repo)))
        }
    }

    @Test
    fun `a new file in a folder store changes the stamp`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val folder = Files.createTempDirectory("y-review-folder").toFile()
            try {
                val store = File(StoreRules.storeFolder(folder.path.replace('\\', '/'))).apply { mkdirs() }
                File(store, "first").writeText("one")
                val before = stamp(repo, folder)
                assertTrue(before.matches(stamp(repo, folder)))
                File(store, "second").writeText("two")
                assertFalse(before.matches(stamp(repo, folder)))
            } finally {
                folder.deleteRecursively()
            }
        }
    }

    @Test
    fun `another open outside file changes the stamp`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            assertFalse(stamp(repo, outside = listOf("/a")).matches(stamp(repo, outside = listOf("/a", "/b"))))
        }
    }

    @Test
    fun `a reftable repository gives a stamp that is not sure and never matches`() {
        val dir = Files.createTempDirectory("y-review-reftable").toFile()
        try {
            if (!ProcessGitRunner(dir).run("init", "-q", "--ref-format=reftable").ok) return
            val stamp = ScanStamp.build(mapOf(dir.path to null), listOf(dir.path), emptyList(), emptyList())
            assertFalse(stamp.sure)
            assertFalse(stamp.matches(stamp))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun `the head file gives the same commit as git`() {
        TempRepo().use { repo ->
            val first = repo.commit("a.txt", "one")
            assertEquals(first, GitDirs.head(repo.dir.path))
            check(repo.git.run("pack-refs", "--all").ok)
            assertEquals(first, GitDirs.head(repo.dir.path))
            check(repo.git.run("checkout", "-q", "--detach").ok)
            assertEquals(first, GitDirs.head(repo.dir.path))
            val second = repo.commit("b.txt", "two")
            assertNotEquals(first, second)
            assertEquals(second, GitDirs.head(repo.dir.path))
        }
    }

    @Test
    fun `a folder that is not a repository gives no head`() {
        val dir = Files.createTempDirectory("y-review-none").toFile()
        try {
            assertNull(GitDirs.head(dir.path))
        } finally {
            dir.deleteRecursively()
        }
    }
}
