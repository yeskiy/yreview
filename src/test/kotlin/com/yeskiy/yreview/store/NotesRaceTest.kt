package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Runs [between] one time, right after the first `git notes show` of the wrapped runner. */
private class WriterBetween(private val real: GitRunner, private val between: () -> Unit) : GitRunner {

    private val done = AtomicBoolean(false)

    override fun run(vararg args: String): GitResult {
        val result = real.run(*args)
        if (args.firstOrNull() == "notes" && args.contains("show") && done.compareAndSet(false, true)) between()
        return result
    }
}

/** Two writers of one note ref. No writer may drop a record that another writer added. */
class NotesRaceTest {

    private fun book(git: GitRunner) = CommentBook(NotesGateway(git), author = "reviewer@example.com")

    private fun range(line: Int) = Range(startLine = line, endLine = line)

    @Test
    fun `a delete keeps a comment that another writer added after the read`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val gone = book(repo.git).add(NoteRefs.LOCAL, head, "a.kt", range(1), "delete this one")
            val kept = book(repo.git).add(NoteRefs.LOCAL, head, "a.kt", range(2), "keep this one")
            lateinit var late: StoredComment
            val racing = WriterBetween(repo.git) {
                late = book(repo.git).add(NoteRefs.LOCAL, head, "a.kt", range(3), "the agent wrote this one")
            }
            book(racing).remove(listOf(gone))

            assertEquals(setOf(kept.id, late.id), book(repo.git).list(head).map { it.id }.toSet())
        }
    }

    @Test
    fun `writers on several threads lose no comment`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val doomed = (1..WRITERS).map { book(repo.git).add(NoteRefs.LOCAL, head, "a.kt", range(it), "delete $it") }
            val pool = Executors.newFixedThreadPool(WRITERS * 2)
            val start = CountDownLatch(1)
            val adds = (1..WRITERS).map { index ->
                pool.submit<StoredComment> {
                    start.await()
                    book(repo.git).add(NoteRefs.LOCAL, head, "a.kt", range(100 + index), "add $index")
                }
            }
            val deletes = doomed.map { record ->
                pool.submit<Int> {
                    start.await()
                    book(repo.git).remove(listOf(record))
                }
            }
            start.countDown()
            val added = adds.map { it.get(WAIT_SECONDS, TimeUnit.SECONDS).id }.toSet()
            deletes.forEach { it.get(WAIT_SECONDS, TimeUnit.SECONDS) }
            pool.shutdown()

            assertEquals(added, book(repo.git).list(head).map { it.id }.toSet())
            assertTrue(added.size == WRITERS)
        }
    }

    private companion object {
        const val WRITERS = 4
        const val WAIT_SECONDS = 120L
    }
}
