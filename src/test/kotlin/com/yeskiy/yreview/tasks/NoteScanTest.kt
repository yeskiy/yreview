package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.GitResult
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteScanTest {

    private class Canceled : RuntimeException()

    private fun reviewed(repo: TempRepo, commits: Int): CommentBook {
        val book = CommentBook(NotesGateway(repo.git), author = "reviewer@example.com")
        (1..commits).forEach { index ->
            val commit = repo.commit("f$index.txt", "line $index")
            val ref = NoteRefs.ALL[index % NoteRefs.ALL.size]
            val first = book.add(ref, commit, "f$index.txt", Range(startLine = 1, endLine = 1), "first $index: \"quoted\"")
            book.add(ref, commit, "f$index.txt", Range(startLine = 1, endLine = 1), "second $index")
            if (index % 3 == 0) book.resolve(first)
        }
        return book
    }

    /** The rows through [NoteScan]. HEAD is null, so the line map starts no diff. */
    private fun rows(git: GitRunner, root: String, showResolved: Boolean, checkCanceled: () -> Unit = {}): List<ReviewTask> =
        TaskScan.placedTasks(git, root, null, null, showResolved, { false }, checkCanceled = checkCanceled)

    /** The same rows read note by note through the gateway. */
    private fun slow(repo: TempRepo, root: String, showResolved: Boolean): List<ReviewTask> =
        TaskScan.placedTasks(repo.git, root, null, null, showResolved, { false }, notes = NotesGateway(repo.git))

    @Test
    fun `reads every note of a repository in two git processes`() {
        TempRepo().use { repo ->
            reviewed(repo, commits = 12)
            listOf(false, true).forEach { showResolved ->
                val git = Counting(repo.git)
                val root = File(repo.dir, if (showResolved) "a" else "b").path

                val found = rows(git, root, showResolved)

                assertEquals(2, git.runs.get(), "the scan with the resolved switch at $showResolved")
                assertEquals(slow(repo, root, showResolved), found)
                assertTrue(found.isNotEmpty())
            }
        }
    }

    @Test
    fun `reads the notes again only after a ref moved`() {
        TempRepo().use { repo ->
            val book = reviewed(repo, commits = 4)
            val root = repo.dir.path + "#moved"
            rows(repo.git, root, true)

            val unchanged = Counting(repo.git)
            assertEquals(slow(repo, root, true), rows(unchanged, root, true))
            assertEquals(1, unchanged.runs.get())

            val commit = repo.git.run("rev-parse", "HEAD").stdout.trim()
            book.add(NoteRefs.LOCAL, commit, "new.txt", Range(startLine = 2, endLine = 2), "a new note")
            val moved = Counting(repo.git)
            val found = rows(moved, root, true)
            assertEquals(2, moved.runs.get())
            assertEquals(slow(repo, root, true), found)
            assertTrue(found.any { it.text == "a new note" })
        }
    }

    @Test
    fun `stops between the git steps when the scan is canceled`() {
        TempRepo().use { repo ->
            reviewed(repo, commits = 2)
            val git = Counting(repo.git)

            assertFailsWith<Canceled> { rows(git, repo.dir.path + "#canceled", false) { throw Canceled() } }
            assertEquals(1, git.runs.get())
        }
    }

    @Test
    fun `reads a repository with no review note in one process`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val git = Counting(repo.git)

            assertEquals(emptyList(), rows(git, repo.dir.path + "#empty", true))
            assertEquals(1, git.runs.get())
        }
    }

    @Test
    fun `reads the slow way when git does not start`() {
        val git = Counting(NO_GIT, GitResult(GitResult.DID_NOT_START, "", "no git"))

        assertNull(NoteScan.read(git, "nowhere"))
        val before = git.runs.get()
        assertEquals(emptyList(), rows(git, "nowhere", false))
        assertTrue(git.runs.get() > before + 1)
    }

    @Test
    fun `a warm scan of a real repository root starts no git process`() {
        TempRepo().use { repo ->
            reviewed(repo, commits = 6)
            NoteScan.forget()
            NoteScan.read(repo.git, repo.dir.path)
            val git = Counting(repo.git)
            assertEquals(slow(repo, repo.dir.path, false), TaskScan.placedTasks(git, repo.dir.path, null, null, false, { false }))
            assertEquals(0, git.runs.get())
        }
    }

    @Test
    fun `a note written by git outside the scan shows at the next scan`() {
        TempRepo().use { repo ->
            val book = reviewed(repo, commits = 3)
            NoteScan.forget()
            NoteScan.read(repo.git, repo.dir.path)
            val commit = repo.commit("late.txt", "late")
            book.add(NoteRefs.LOCAL, commit, "late.txt", Range(startLine = 1, endLine = 1), "late comment")
            assertTrue(rows(repo.git, repo.dir.path, false).any { it.text == "late comment" })
        }
    }

    private companion object {
        val NO_GIT = object : GitRunner {
            override fun run(vararg args: String): GitResult = error("never runs")
        }
    }
}
