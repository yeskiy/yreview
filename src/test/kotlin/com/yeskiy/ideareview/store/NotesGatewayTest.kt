package com.yeskiy.ideareview.store

import com.yeskiy.ideareview.TempRepo
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
    fun `reports a write against a revision that does not resolve`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val gateway = NotesGateway(repo.git)
            assertFailsWith<NotesWriteException> {
                gateway.append(NoteRefs.LOCAL, "not-a-rev", "{}")
            }
        }
    }
}
