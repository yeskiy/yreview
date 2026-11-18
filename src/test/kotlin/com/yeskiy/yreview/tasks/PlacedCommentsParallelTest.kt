package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.GitResult
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PlacedCommentsParallelTest {

    /** Counts the diff processes that run at the same moment. */
    private class Overlap(private val git: GitRunner) : GitRunner {
        val now = AtomicInteger()
        val most = AtomicInteger()
        override fun run(vararg args: String): GitResult {
            if ("diff" !in args) return git.run(*args)
            most.accumulateAndGet(now.incrementAndGet(), ::maxOf)
            try {
                Thread.sleep(50)
                return git.run(*args)
            } finally {
                now.decrementAndGet()
            }
        }
    }

    @AfterTest
    fun forget() = DiffCache.forget()

    /** Four commits with one comment each on f.txt, then a fifth commit that adds two lines at the top. */
    private fun buildFourOlderComments(repo: TempRepo): String {
        val book = CommentBook(NotesGateway(repo.git), author = "a@example.com")
        (1..4).forEach { n ->
            val commit = repo.commit("f.txt", (1..6).joinToString("") { "v$n l$it\n" })
            book.add(NoteRefs.LOCAL, commit, "f.txt", Range(startLine = 2, endLine = 2), "c$n")
        }
        return repo.commit("f.txt", "top1\ntop2\n" + (1..6).joinToString("") { "v4 l$it\n" })
    }

    @Test
    fun `the diffs of four older commits run at the same time and give the same places`() {
        TempRepo().use { repo ->
            val head = buildFourOlderComments(repo)
            DiffCache.forget()
            val serial = PlacedComments.of(repo.git, repo.dir.path, head)
            DiffCache.forget()
            val git = Overlap(repo.git)
            val parallel = PlacedComments.of(git, repo.dir.path, head)
            assertEquals(4, serial.size)
            assertEquals(serial, parallel)
            assertTrue(git.most.get() >= 2, "the most diffs at one moment: ${git.most.get()}")
        }
    }
}
