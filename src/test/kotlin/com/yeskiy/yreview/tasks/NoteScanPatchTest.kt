package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NoteScanPatchTest {

    private fun gateway(repo: TempRepo) = NotesGateway(repo.git, repo.dir.path) { NoteScan.moved(repo.dir.path, it) }

    private fun book(repo: TempRepo) = CommentBook(gateway(repo), author = "a@example.com")

    private val line = Range(startLine = 1, endLine = 1)

    /** A warm read starts [runs] git processes and gives the same notes, in the same order, as a cold read. */
    private fun assertWarmIsCold(repo: TempRepo, runs: Int = 0) {
        val counting = Counting(repo.git)
        val warm = NoteScan.read(counting, repo.dir.path)!!
        assertEquals(runs, counting.runs.get())
        NoteScan.forget()
        val cold = NoteScan.read(repo.git, repo.dir.path)!!
        NoteRefs.ALL.forEach { ref ->
            assertEquals(cold.commitsWithNotes(ref), warm.commitsWithNotes(ref), ref)
            cold.commitsWithNotes(ref).forEach { commit -> assertEquals(cold.readLines(ref, commit), warm.readLines(ref, commit)) }
        }
    }

    @Test
    fun `an append patches the cache to the same notes as a cold read`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            val book = book(repo)
            book.add(NoteRefs.LOCAL, commit, "a.txt", line, "first")
            NoteScan.forget()
            NoteScan.read(repo.git, repo.dir.path)
            book.add(NoteRefs.LOCAL, commit, "a.txt", line, "second")
            assertWarmIsCold(repo)
            assertEquals(2, NoteScan.read(repo.git, repo.dir.path)!!.readLines(NoteRefs.LOCAL, commit).size)
        }
    }

    @Test
    fun `a resolve, a rewrite and a delete patch the cache to the same notes as a cold read`() {
        TempRepo().use { repo ->
            val other = repo.commit("b.txt", "b")
            val commit = repo.commit("a.txt", "a")
            val book = book(repo)
            book.add(NoteRefs.LOCAL, other, "b.txt", line, "stays")
            val first = book.add(NoteRefs.LOCAL, commit, "a.txt", line, "first")
            book.add(NoteRefs.LOCAL, commit, "a.txt", line, "second")
            NoteScan.forget()
            NoteScan.read(repo.git, repo.dir.path)

            book.resolve(first)
            assertWarmIsCold(repo)

            gateway(repo).rewrite(NoteRefs.LOCAL, commit, gateway(repo).readLines(NoteRefs.LOCAL, commit).drop(1))
            assertWarmIsCold(repo)

            book.remove(book.list(commit))
            assertWarmIsCold(repo)
            assertEquals(listOf(other), NoteScan.read(repo.git, repo.dir.path)!!.commitsWithNotes(NoteRefs.LOCAL))
        }
    }

    @Test
    fun `a write to a ref with no note yet patches the cache`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            val book = book(repo)
            book.add(NoteRefs.LOCAL, commit, "a.txt", line, "local")
            NoteScan.forget()
            NoteScan.read(repo.git, repo.dir.path)
            book.add(NoteRefs.DISCUSS, commit, "a.txt", line, "discuss")
            assertWarmIsCold(repo)
            assertEquals(1, NoteScan.read(repo.git, repo.dir.path)!!.readLines(NoteRefs.DISCUSS, commit).size)
        }
    }

    @Test
    fun `a write after an outside move drops the entry and the next scan reads git`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            val book = book(repo)
            book.add(NoteRefs.LOCAL, commit, "a.txt", line, "first")
            NoteScan.forget()
            NoteScan.read(repo.git, repo.dir.path)
            CommentBook(NotesGateway(repo.git), author = "outside@example.com").add(NoteRefs.LOCAL, commit, "a.txt", line, "outside")
            book.add(NoteRefs.LOCAL, commit, "a.txt", line, "third")
            assertWarmIsCold(repo, runs = 1)
            val texts = NoteScan.read(repo.git, repo.dir.path)!!.readLines(NoteRefs.LOCAL, commit)
            assertEquals(3, texts.size)
            assertTrue(texts.any { "outside" in it })
        }
    }
}
