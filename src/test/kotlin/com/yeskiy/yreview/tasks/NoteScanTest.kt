package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.GitResult
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteScanTest {

    /** Counts every git process of one scan. */
    private class Counting(private val git: GitRunner, private val answer: GitResult? = null) : GitRunner {
        val runs = AtomicInteger()
        override fun run(vararg args: String): GitResult = runs.incrementAndGet().let { answer ?: git.run(*args) }
    }

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

    private fun slow(book: CommentBook, showResolved: Boolean): List<ScanRecord> = TaskScan.records(book, showResolved)

    @Test
    fun `reads every note of a repository in two git processes`() {
        TempRepo().use { repo ->
            val book = reviewed(repo, commits = 12)
            listOf(false, true).forEach { showResolved ->
                val git = Counting(repo.git)
                val root = File(repo.dir, if (showResolved) "a" else "b").path

                val found = TaskScan.gitRecords(git, root, showResolved) {}

                assertEquals(2, git.runs.get(), "the scan with the resolved switch at $showResolved")
                assertEquals(slow(book, showResolved), found)
            }
        }
    }

    @Test
    fun `reads the notes again only after a ref moved`() {
        TempRepo().use { repo ->
            val book = reviewed(repo, commits = 4)
            val root = repo.dir.path + "#moved"
            TaskScan.gitRecords(repo.git, root, true) {}

            val unchanged = Counting(repo.git)
            assertEquals(slow(book, true), TaskScan.gitRecords(unchanged, root, true) {})
            assertEquals(1, unchanged.runs.get())

            val commit = repo.git.run("rev-parse", "HEAD").stdout.trim()
            book.add(NoteRefs.LOCAL, commit, "new.txt", Range(startLine = 2, endLine = 2), "a new note")
            val moved = Counting(repo.git)
            val found = TaskScan.gitRecords(moved, root, true) {}
            assertEquals(2, moved.runs.get())
            assertEquals(slow(book, true), found)
            assertTrue(found.orEmpty().any { it.stored.comment.description == "a new note" })
        }
    }

    @Test
    fun `stops between the git steps when the scan is canceled`() {
        TempRepo().use { repo ->
            reviewed(repo, commits = 2)
            val git = Counting(repo.git)

            assertFailsWith<Canceled> { TaskScan.gitRecords(git, repo.dir.path + "#canceled", false) { throw Canceled() } }
            assertEquals(1, git.runs.get())
        }
    }

    @Test
    fun `reads a repository with no review note in one process`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val git = Counting(repo.git)

            assertEquals(emptyList(), TaskScan.gitRecords(git, repo.dir.path + "#empty", true) {})
            assertEquals(1, git.runs.get())
        }
    }

    @Test
    fun `gives no answer when git does not start, so the caller reads the slow way`() {
        val git = Counting(NO_GIT, GitResult(GitResult.DID_NOT_START, "", "no git"))

        assertNull(TaskScan.gitRecords(git, "nowhere", false) {})
    }

    private companion object {
        val NO_GIT = object : GitRunner {
            override fun run(vararg args: String): GitResult = error("never runs")
        }
    }
}
