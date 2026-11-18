package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NotesGatewayCountTest {

    private class Counting(private val git: GitRunner) : GitRunner {
        val runs = AtomicInteger()
        override fun run(vararg args: String): GitResult = runs.incrementAndGet().let { git.run(*args) }
    }

    /** Runs [between] one time, right before the first `update-ref` that moves [ref]. */
    private class WriterBeforeMove(private val real: GitRunner, private val ref: String, private val between: () -> Unit) : GitRunner {
        private val done = AtomicBoolean(false)
        val moves = AtomicInteger()

        override fun run(vararg args: String): GitResult {
            if (args.size == 4 && args[0] == "update-ref" && args[1] == ref) {
                moves.incrementAndGet()
                if (done.compareAndSet(false, true)) between()
            }
            return real.run(*args)
        }
    }

    private fun appendOutside(repo: TempRepo, commit: String, line: String) {
        val file = File.createTempFile("y-review-outside", ".json").apply { writeText(line) }
        try {
            check(repo.git.run("notes", "--ref", NoteRefs.LOCAL, "append", "-F", file.absolutePath, commit).ok)
        } finally {
            file.delete()
        }
    }

    @Test
    fun `an append with a root runs 4 git processes and an append without a root runs 7`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            NotesGateway(repo.git).append(NoteRefs.LOCAL, commit, "{\"first\":1}")
            val withRoot = Counting(repo.git)
            NotesGateway(withRoot, repo.dir.path).append(NoteRefs.LOCAL, commit, "{\"second\":2}")
            assertEquals(4, withRoot.runs.get())
            val withoutRoot = Counting(repo.git)
            NotesGateway(withoutRoot).append(NoteRefs.LOCAL, commit, "{\"third\":3}")
            assertEquals(7, withoutRoot.runs.get())
            assertEquals(3, NotesGateway(repo.git).readLines(NoteRefs.LOCAL, commit).size)
            assertTrue(repo.git.run("for-each-ref", "refs/notes/y-review/scratch/").stdout.isBlank())
        }
    }

    @Test
    fun `a first append with a root still writes the note`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            NotesGateway(repo.git, repo.dir.path).append(NoteRefs.LOCAL, commit, "{\"first\":1}")
            assertEquals(listOf("{\"first\":1}"), NotesGateway(repo.git).readLines(NoteRefs.LOCAL, commit))
        }
    }

    @Test
    fun `a move that loses the race against an outside writer retries and lands`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            NotesGateway(repo.git).append(NoteRefs.LOCAL, commit, "{\"first\":1}")
            val racing = WriterBeforeMove(repo.git, NoteRefs.LOCAL) { appendOutside(repo, commit, "{\"outside\":1}") }
            NotesGateway(racing, repo.dir.path).append(NoteRefs.LOCAL, commit, "{\"second\":2}")
            assertEquals(2, racing.moves.get())
            assertEquals(
                setOf("{\"first\":1}", "{\"outside\":1}", "{\"second\":2}"),
                NotesGateway(repo.git).readLines(NoteRefs.LOCAL, commit).toSet(),
            )
            assertTrue(repo.git.run("for-each-ref", "refs/notes/y-review/scratch/").stdout.isBlank())
        }
    }
}
