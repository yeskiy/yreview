package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.Test
import kotlin.test.assertEquals

class NoteScanRaceTest {

    @Test
    fun `parallel writes and scans leave a cache equal to a cold read`() {
        TempRepo().use { repo ->
            val commits = listOf(repo.commit("a.txt", "a"), repo.commit("b.txt", "b"))
            val book = CommentBook(NotesGateway(repo.git, repo.dir.path) { NoteScan.moved(repo.dir.path, it) }, author = "a@example.com")
            NoteScan.forget()
            val writing = AtomicBoolean(true)
            val pool = Executors.newFixedThreadPool(6)
            try {
                val readers = (1..2).map {
                    pool.submit { generateSequence { writing.get() }.takeWhile { it }.forEach { NoteScan.read(repo.git, repo.dir.path) } }
                }
                val writers = (0 until 4).map { thread ->
                    pool.submit {
                        (0 until 25).forEach { index ->
                            book.add(NoteRefs.ALL[index % 2], commits[thread % 2], "a.txt", Range(startLine = 1, endLine = 1), "w$thread-$index")
                        }
                    }
                }
                writers.forEach { it.get(5, TimeUnit.MINUTES) }
                writing.set(false)
                readers.forEach { it.get(1, TimeUnit.MINUTES) }
            } finally {
                writing.set(false)
                pool.shutdownNow()
            }
            val warm = NoteScan.read(repo.git, repo.dir.path)!!
            NoteScan.forget()
            val cold = NoteScan.read(repo.git, repo.dir.path)!!
            assertEquals(100, NoteRefs.ALL.sumOf { ref -> commits.sumOf { cold.readLines(ref, it).size } })
            NoteRefs.ALL.forEach { ref ->
                assertEquals(cold.commitsWithNotes(ref), warm.commitsWithNotes(ref), ref)
                commits.forEach { commit -> assertEquals(cold.readLines(ref, commit), warm.readLines(ref, commit), "$ref $commit") }
            }
        }
    }
}
