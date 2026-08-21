package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * A delete of one review comment.
 *
 * A comment is one line of a git note. A delete reads the note, drops that line, and writes
 * the note again. The tests hold the promise that the other lines come back byte for byte.
 */
class CommentRemovalTest {

    private fun book(repo: TempRepo, now: Long = 1787194427L) =
        CommentBook(NotesGateway(repo.git), author = "39830788+yeskiy@users.noreply.github.com", clock = { now })

    private fun lines(repo: TempRepo, ref: String = NoteRefs.LOCAL, commit: String) =
        NotesGateway(repo.git).readLines(ref, commit)

    @Test
    fun `a delete of one comment keeps the others byte for byte`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "keep this one")
            val second = store.add(NoteRefs.LOCAL, head, "a.kt", 2, 2, "delete this one")
            val third = store.add(NoteRefs.LOCAL, head, "a.kt", 3, 3, "keep this one too")
            val before = lines(repo, commit = head)

            assertEquals(1, book(repo).remove(listOf(second)))

            assertEquals(listOf(before[0], before[2]), lines(repo, commit = head))
            assertEquals(setOf(first.id, third.id), book(repo).list(head).map { it.id }.toSet())
        }
    }

    @Test
    fun `a delete leaves the note ref valid`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "keep this one")
            val second = store.add(NoteRefs.LOCAL, head, "a.kt", 2, 2, "delete this one")

            book(repo).remove(listOf(second))

            assertEquals(listOf(head), NotesGateway(repo.git).commitsWithNotes(NoteRefs.LOCAL))
            assertEquals(1, book(repo).open(head).size)
        }
    }

    @Test
    fun `a delete of the last comment removes the note and keeps the ref readable`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val only = book(repo).add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "the only one")

            assertEquals(1, book(repo).remove(listOf(only)))

            assertTrue(lines(repo, commit = head).isEmpty())
            assertTrue(NotesGateway(repo.git).commitsWithNotes(NoteRefs.LOCAL).isEmpty())
        }
    }

    @Test
    fun `a delete takes the resolve record of that comment with it`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "resolve me")
            store.resolve(first)
            assertEquals(2, lines(repo, commit = head).size)

            assertEquals(2, book(repo).remove(listOf(first)))

            assertTrue(book(repo).list(head).isEmpty())
        }
    }

    @Test
    fun `a delete keeps the comments of another commit`() {
        TempRepo().use { repo ->
            val first = repo.commit("a.kt", "one")
            val second = repo.commit("b.kt", "two")
            val store = book(repo)
            val gone = store.add(NoteRefs.LOCAL, first, "a.kt", 1, 1, "delete this one")
            store.add(NoteRefs.LOCAL, second, "b.kt", 1, 1, "keep this one")
            val kept = lines(repo, commit = second)

            book(repo).remove(listOf(gone))

            assertEquals(kept, lines(repo, commit = second))
            assertEquals(listOf(second), NotesGateway(repo.git).commitsWithNotes(NoteRefs.LOCAL))
        }
    }

    @Test
    fun `a delete keeps the comments of another ref`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val gone = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "delete this one")
            store.add(NoteRefs.DISCUSS, head, "a.kt", 2, 2, "keep this one")
            val kept = lines(repo, NoteRefs.DISCUSS, head)

            book(repo).remove(listOf(gone))

            assertEquals(kept, lines(repo, NoteRefs.DISCUSS, head))
        }
    }

    @Test
    fun `a delete of two comments of one note needs one write`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "delete this one")
            val second = store.add(NoteRefs.LOCAL, head, "a.kt", 2, 2, "delete this one too")
            val third = store.add(NoteRefs.LOCAL, head, "a.kt", 3, 3, "keep this one")
            val before = lines(repo, commit = head)

            assertEquals(2, book(repo).remove(listOf(first, second)))

            assertEquals(listOf(before[2]), lines(repo, commit = head))
            assertEquals(listOf(third.id), book(repo).list(head).map { it.id })
        }
    }

    @Test
    fun `a delete of an unknown comment writes nothing`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "keep this one")
            val before = lines(repo, commit = head)
            val unknown = StoredComment(
                id = "0000000000000000000000000000000000000000",
                ref = NoteRefs.LOCAL,
                comment = Comment(
                    timestamp = "1700000000",
                    author = "a@b.c",
                    description = "not in the note",
                    location = Location(commit = head, path = "a.kt"),
                ),
            )

            assertEquals(0, book(repo).remove(listOf(unknown)))

            assertEquals(before, lines(repo, commit = head))
        }
    }

    @Test
    fun `findAll reports the records of these identifiers`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "one")
            store.add(NoteRefs.LOCAL, head, "a.kt", 2, 2, "two")
            val third = store.add(NoteRefs.DISCUSS, head, "a.kt", 3, 3, "three")

            val found = book(repo).findAll(setOf(first.id, third.id))

            assertEquals(setOf(first.id, third.id), found.map { it.id }.toSet())
            assertEquals(setOf(NoteRefs.LOCAL, NoteRefs.DISCUSS), found.map { it.ref }.toSet())
        }
    }
}
