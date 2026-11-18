package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteTipsTest {

    private val refs = NoteRefs.ALL

    private fun byGit(git: GitRunner, refs: List<String>): Map<String, String> =
        git.run("for-each-ref", "--format=%(objectname)%09%(refname)", *refs.toTypedArray()).stdout.lines()
            .map { it.split('\t') }.filter { it.size == 2 }.associate { it[1] to it[0] }
            .let { found -> refs.filter { it in found }.associateWith { found.getValue(it) } }

    private fun note(git: GitRunner, ref: String, commit: String, text: String) =
        check(git.run("notes", "--ref", ref, "append", "-m", text, commit).ok)

    private fun common(repo: TempRepo): Path = GitDirs.commonDir(repo.dir.path)!!

    private fun same(repo: TempRepo): Map<String, String> =
        NoteTips.read(common(repo), refs).also { assertEquals(byGit(repo.git, refs), it) }!!

    @Test
    fun `a loose ref gives the same tip as git`() {
        TempRepo().use { repo ->
            note(repo.git, NoteRefs.LOCAL, repo.commit("a.txt", "one"), "first")
            assertTrue(Files.isRegularFile(common(repo).resolve(NoteRefs.LOCAL)))
            assertEquals(setOf(NoteRefs.LOCAL), same(repo).keys)
        }
    }

    @Test
    fun `a packed ref gives the same tip as git`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "one")
            note(repo.git, NoteRefs.LOCAL, commit, "first")
            note(repo.git, NoteRefs.DISCUSS, commit, "talk")
            check(repo.git.run("pack-refs", "--all").ok)
            assertFalse(Files.exists(common(repo).resolve(NoteRefs.LOCAL)))
            assertEquals(listOf(NoteRefs.DISCUSS, NoteRefs.LOCAL), same(repo).keys.toList())
        }
    }

    @Test
    fun `a loose ref after a packed ref gives the newer tip`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "one")
            note(repo.git, NoteRefs.LOCAL, commit, "first")
            check(repo.git.run("pack-refs", "--all").ok)
            val packed = same(repo).getValue(NoteRefs.LOCAL)
            note(repo.git, NoteRefs.LOCAL, commit, "second")
            assertTrue(same(repo).getValue(NoteRefs.LOCAL) != packed)
        }
    }

    @Test
    fun `a ref that does not exist is not in the answer`() {
        TempRepo().use { repo ->
            note(repo.git, NoteRefs.LOCAL, repo.commit("a.txt", "one"), "first")
            assertTrue(NoteRefs.DISCUSS !in same(repo))
        }
    }

    @Test
    fun `a deleted packed ref is not in the answer`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "one")
            note(repo.git, NoteRefs.LOCAL, commit, "first")
            note(repo.git, NoteRefs.ANALYSES, commit, "found")
            check(repo.git.run("pack-refs", "--all").ok)
            check(repo.git.run("update-ref", "-d", NoteRefs.LOCAL).ok)
            assertEquals(setOf(NoteRefs.ANALYSES), same(repo).keys)
        }
    }

    @Test
    fun `a linked worktree reads the refs of the main repository`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "one")
            val tree = File(Files.createTempDirectory("y-review-tree").toFile(), "wt")
            try {
                check(repo.git.run("worktree", "add", "-q", tree.path.replace('\\', '/')).ok)
                val linked = assertNotNull(GitDirs.commonDir(tree.path))
                assertEquals(File(repo.dir, ".git").toPath().toRealPath(), linked.toRealPath())
                note(repo.git, NoteRefs.LOCAL, commit, "from main")
                assertEquals(byGit(ProcessGitRunner(tree), refs), NoteTips.read(linked, refs))
                assertTrue(NoteRefs.LOCAL in NoteTips.read(linked, refs)!!)
            } finally {
                tree.parentFile.deleteRecursively()
            }
        }
    }

    @Test
    fun `a reftable repository gives no file answer`() {
        val dir = Files.createTempDirectory("y-review-reftable").toFile()
        try {
            if (ProcessGitRunner(dir).run("init", "-q", "--ref-format=reftable").ok) assertNull(GitDirs.commonDir(dir.path))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun `a folder that is not a repository root gives no answer`() {
        val dir = Files.createTempDirectory("y-review-none").toFile()
        try {
            assertNull(GitDirs.commonDir(dir.path))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun `a read during many writes never stops a write`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "one")
            note(repo.git, NoteRefs.LOCAL, commit, "start")
            val common = common(repo)
            val done = AtomicBoolean()
            val reads = AtomicInteger()
            val reader = thread {
                while (!done.get()) NoteTips.read(common, refs).also { reads.incrementAndGet() }
            }
            val failed = try {
                (1..WRITES).count { !repo.git.run("notes", "--ref", NoteRefs.LOCAL, "append", "-m", "note $it", commit).ok }
            } finally {
                done.set(true)
                reader.join()
            }
            assertEquals(0, failed)
            assertTrue(reads.get() > WRITES)
            same(repo)
        }
    }

    private companion object {
        const val WRITES = 200
    }
}
