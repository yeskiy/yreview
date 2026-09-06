package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NotesGatewayTest {

    @Test
    fun `returns nothing when the ref does not exist`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            assertEquals(emptyList(), gateway.readLines(NoteRefs.LOCAL, head))
        }
    }

    @Test
    fun `appends and reads one line`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            gateway.append(NoteRefs.LOCAL, head, """{"timestamp":"1700000000","author":"a@b.c"}""")
            assertEquals(1, gateway.readLines(NoteRefs.LOCAL, head).size)
        }
    }

    @Test
    fun `keeps every appended line and drops the blank separators`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            repeat(3) { index ->
                gateway.append(NoteRefs.LOCAL, head, """{"timestamp":"170000000$index","author":"a@b.c"}""")
            }
            val lines = gateway.readLines(NoteRefs.LOCAL, head)
            assertEquals(3, lines.size)
            assertTrue(lines.none { it.isBlank() })
        }
    }

    @Test
    fun `keeps a line that holds both quotes and spaces byte for byte`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            val line = """{"timestamp":"1787194427","author":"a@b.c","description":"fix this thing"}"""
            gateway.append(NoteRefs.LOCAL, head, line)
            assertEquals(line, gateway.readLines(NoteRefs.LOCAL, head).single())
        }
    }

    @Test
    fun `keeps the refs apart`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            gateway.append(NoteRefs.LOCAL, head, """{"timestamp":"1700000000","author":"local"}""")
            gateway.append(NoteRefs.DISCUSS, head, """{"timestamp":"1700000001","author":"shared"}""")
            assertTrue(gateway.readLines(NoteRefs.LOCAL, head).single().contains("local"))
            assertTrue(gateway.readLines(NoteRefs.DISCUSS, head).single().contains("shared"))
        }
    }

    @Test
    fun `lists the commits that carry a note`() {
        TempRepo().use { repo ->
            val first = repo.commit("a.txt", "one")
            val second = repo.commit("b.txt", "two")
            val gateway = NotesGateway(repo.git)
            gateway.append(NoteRefs.LOCAL, first, """{"timestamp":"1700000000","author":"a@b.c"}""")
            gateway.append(NoteRefs.LOCAL, second, """{"timestamp":"1700000001","author":"a@b.c"}""")
            assertEquals(setOf(first, second), gateway.commitsWithNotes(NoteRefs.LOCAL).toSet())
        }
    }

    @Test
    fun `rewrite keeps the lines it is given and drops the rest`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            val lines = (1..3).map { """{"timestamp":"170000000$it","author":"a@b.c","description":"fix it"}""" }
            lines.forEach { gateway.append(NoteRefs.LOCAL, head, it) }

            gateway.rewrite(NoteRefs.LOCAL, head, listOf(lines[0], lines[2]))

            assertEquals(listOf(lines[0], lines[2]), gateway.readLines(NoteRefs.LOCAL, head))
        }
    }

    @Test
    fun `rewrite writes the same layout that append writes`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            val first = """{"timestamp":"1700000000","author":"a@b.c"}"""
            val second = """{"timestamp":"1700000001","author":"a@b.c"}"""
            gateway.append(NoteRefs.LOCAL, head, first)
            gateway.append(NoteRefs.LOCAL, head, second)
            val appended = repo.git.run("notes", "--ref", NoteRefs.LOCAL, "show", head).stdout

            gateway.rewrite(NoteRefs.LOCAL, head, listOf(first, second))

            assertEquals(appended, repo.git.run("notes", "--ref", NoteRefs.LOCAL, "show", head).stdout)
        }
    }

    @Test
    fun `rewrite with no line removes the note and keeps the ref`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            gateway.append(NoteRefs.LOCAL, head, """{"timestamp":"1700000000","author":"a@b.c"}""")

            gateway.rewrite(NoteRefs.LOCAL, head, emptyList())

            assertTrue(gateway.readLines(NoteRefs.LOCAL, head).isEmpty())
            assertTrue(gateway.commitsWithNotes(NoteRefs.LOCAL).isEmpty())
        }
    }

    @Test
    fun `rewrite with no line accepts a commit that carries no note`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            NotesGateway(repo.git).rewrite(NoteRefs.LOCAL, head, emptyList())
        }
    }

    @Test
    fun `rewrite keeps the other ref untouched`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            gateway.append(NoteRefs.LOCAL, head, """{"timestamp":"1700000000","author":"local"}""")
            gateway.append(NoteRefs.DISCUSS, head, """{"timestamp":"1700000001","author":"shared"}""")

            gateway.rewrite(NoteRefs.LOCAL, head, emptyList())

            assertTrue(gateway.readLines(NoteRefs.DISCUSS, head).single().contains("shared"))
        }
    }

    @Test
    fun `reports a rewrite against a revision that does not resolve`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            assertFailsWith<NotesWriteException> {
                NotesGateway(repo.git).rewrite(NoteRefs.LOCAL, "not-a-rev", listOf("{}"))
            }
        }
    }

    @Test
    fun `reports a write against a revision that does not resolve`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            assertFailsWith<NotesWriteException> {
                gateway.append(NoteRefs.LOCAL, "not-a-rev", "{}")
            }
        }
    }

    // --- A read the plugin cannot trust ---

    @Test
    fun `the refusing read gives no record for a commit that carries no note`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "one")
            assertEquals(emptyList(), NotesGateway(repo.git).readOrRefuse(NoteRefs.LOCAL, head))
        }
    }

    @Test
    fun `the refusing read stops a note the runner refused`() {
        val gateway = NotesGateway(OneAnswer(GitResult(GitResult.TOO_MUCH_OUTPUT, "", "the note passed the limit")))

        assertFailsWith<NotesWriteException> { gateway.readOrRefuse(NoteRefs.LOCAL, "deadbeef") }
    }

    @Test
    fun `the refusing read stops a git that never started`() {
        val gateway = NotesGateway(OneAnswer(GitResult(GitResult.DID_NOT_START, "", "the plugin could not start git")))

        assertFailsWith<NotesWriteException> { gateway.readOrRefuse(NoteRefs.LOCAL, "deadbeef") }
    }

    @Test
    fun `the quiet read gives no record for a note the runner refused`() {
        val gateway = NotesGateway(OneAnswer(GitResult(GitResult.TOO_MUCH_OUTPUT, "", "the note passed the limit")))

        assertEquals(emptyList(), gateway.readLines(NoteRefs.LOCAL, "deadbeef"))
    }

    @Test
    fun `the refusing list stops a git that never started`() {
        val gateway = NotesGateway(OneAnswer(GitResult(GitResult.DID_NOT_START, "", "the plugin could not start git")))

        assertFailsWith<NotesWriteException> { gateway.commitsOrRefuse(NoteRefs.LOCAL) }
    }

    @Test
    fun `the refusing list gives no key for a ref that holds no note`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            assertEquals(emptyList(), NotesGateway(repo.git).commitsOrRefuse(NoteRefs.LOCAL))
        }
    }

    @Test
    fun `the quiet list gives no key for a git that never started`() {
        val gateway = NotesGateway(OneAnswer(GitResult(GitResult.DID_NOT_START, "", "the plugin could not start git")))

        assertEquals(emptyList(), gateway.commitsWithNotes(NoteRefs.LOCAL))
    }
}

/** A runner that gives one answer to every command. */
private class OneAnswer(private val answer: GitResult) : GitRunner {

    override fun run(vararg args: String): GitResult = answer
}
