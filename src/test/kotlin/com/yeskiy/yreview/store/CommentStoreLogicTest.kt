package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CommentStoreLogicTest {

    private fun book(repo: TempRepo, now: Long = 1787194427L) =
        CommentBook(NotesGateway(repo.git), author = "reviewer@example.com", clock = { now })

    @Test
    fun `lists every record that can be a task`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val first = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "one")
            val second = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 2, endLine = 2), "two")

            assertEquals(setOf(first.id, second.id), book(repo).tasks().map { it.id }.toSet())
        }
    }

    @Test
    fun `leaves the resolve records out of the task list`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val stored = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "one")
            book(repo).resolve(stored)

            assertEquals(listOf(stored.id), book(repo).tasks().map { it.id })
            assertEquals(2, book(repo).list(head).size)
        }
    }

    @Test
    fun `a task keeps its place after a resolve`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val stored = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "one")
            book(repo).resolve(stored)

            assertEquals(head, book(repo).tasks().single().commit)
        }
    }

    @Test
    fun `writes a comment that reads back with its anchor`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val stored = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 88, endLine = 94), "fix this")
            val read = book(repo).list(head).single()
            assertEquals(stored.id, read.id)
            assertEquals("a.kt", read.comment.location?.path)
            assertEquals(88, read.comment.location?.range?.startLine)
            assertEquals(94, read.comment.location?.range?.endLine)
            assertEquals("fix this", read.comment.description)
        }
    }

    @Test
    fun `writes the characters of a comment on a part of a line`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(
                NoteRefs.LOCAL,
                head,
                "a.kt",
                Range(startLine = 1, startColumn = 4, endLine = 1, endColumn = 9),
                "fix this word",
            )
            val range = book(repo).list(head).single().comment.location?.range
            assertEquals(4, range?.startColumn)
            assertEquals(9, range?.endColumn)
        }
    }

    @Test
    fun `writes no character for a comment on whole lines`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 88, endLine = 94), "fix this")
            val range = book(repo).list(head).single().comment.location?.range
            assertEquals(0, range?.startColumn)
            assertEquals(0, range?.endColumn)
        }
    }

    @Test
    fun `the note of a comment on whole lines holds no character field`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 88, endLine = 94), "fix this")
            val note = NotesGateway(repo.git).readLines(NoteRefs.LOCAL, head).single()
            assertTrue(note.contains("""{"startLine":88,"endLine":94}"""), note)
            assertFalse(note.contains("Column"), note)
        }
    }

    @Test
    fun `the note of a comment on a part of a line holds both character fields`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(
                NoteRefs.LOCAL,
                head,
                "a.kt",
                Range(startLine = 88, startColumn = 4, endLine = 94, endColumn = 9),
                "fix this word",
            )
            val note = NotesGateway(repo.git).readLines(NoteRefs.LOCAL, head).single()
            assertTrue(
                note.contains("""{"startLine":88,"startColumn":4,"endLine":94,"endColumn":9}"""),
                note,
            )
        }
    }

    @Test
    fun `a stored comment carries the key it was read with`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 88, endLine = 94), "fix this")
            assertEquals(head, book(repo).list(head).single().commit)
        }
    }

    @Test
    fun `stamps a ten digit timestamp and the author`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val stored = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            assertEquals("1787194427", stored.comment.timestamp)
            assertEquals(10, stored.comment.timestamp.length)
            assertEquals("reviewer@example.com", stored.comment.author)
        }
    }

    @Test
    fun `reads every ref and reports which one holds the comment`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            store.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "private")
            store.add(NoteRefs.DISCUSS, head, "a.kt", Range(startLine = 2, endLine = 2), "shared")
            val byRef = book(repo).list(head).associateBy { it.ref }
            assertEquals("private", byRef.getValue(NoteRefs.LOCAL).comment.description)
            assertEquals("shared", byRef.getValue(NoteRefs.DISCUSS).comment.description)
        }
    }

    @Test
    fun `resolve appends a new comment that points at the original`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            store.resolve(first)

            val all = book(repo).list(head)
            assertEquals(2, all.size)
            val update = all.single { it.comment.original != null }
            assertEquals(first.id, update.comment.original)
            assertEquals(true, update.comment.resolved)
        }
    }

    @Test
    fun `a resolved comment is not listed as open`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            store.resolve(first)
            assertTrue(book(repo).open(head).isEmpty())
        }
    }

    @Test
    fun `an unresolved comment is listed as open`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            assertEquals(1, book(repo).open(head).size)
        }
    }

    @Test
    fun `a resolved comment is listed as closed`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            store.resolve(first)

            val closed = book(repo).closed(head)
            assertEquals(1, closed.size)
            assertEquals(first.id, closed.single().id)
        }
    }

    @Test
    fun `an open comment is not listed as closed`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            assertTrue(book(repo).closed(head).isEmpty())
        }
    }

    @Test
    fun `commits reports every revision that carries a note`() {
        TempRepo().use { repo ->
            val first = repo.commit("a.kt", "one")
            val second = repo.commit("b.kt", "two")
            val store = book(repo)
            store.add(NoteRefs.LOCAL, first, "a.kt", Range(startLine = 1, endLine = 1), "x")
            store.add(NoteRefs.DISCUSS, second, "b.kt", Range(startLine = 1, endLine = 1), "y")

            assertEquals(setOf(first, second), book(repo).commits().toSet())
        }
    }

    @Test
    fun `commits reports nothing when no note exists`() {
        TempRepo().use { repo ->
            repo.commit("a.kt", "one")
            assertTrue(book(repo).commits().isEmpty())
        }
    }

    @Test
    fun `find returns the comment with that id from any revision`() {
        TempRepo().use { repo ->
            repo.commit("a.kt", "one")
            val second = repo.commit("b.kt", "two")
            val wanted = book(repo).add(NoteRefs.DISCUSS, second, "b.kt", Range(startLine = 4, endLine = 6), "look here")

            val found = book(repo).find(wanted.id)
            assertEquals(wanted.id, found?.id)
            assertEquals(NoteRefs.DISCUSS, found?.ref)
            assertEquals("look here", found?.comment?.description)
        }
    }

    @Test
    fun `find returns nothing for an unknown id`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")
            assertNull(book(repo).find("0000000000000000000000000000000000000000"))
        }
    }

    @Test
    fun `findAt returns the comment of that key`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val wanted = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "fix this")

            assertEquals(wanted.id, book(repo).findAt(head, wanted.id)?.id)
        }
    }

    @Test
    fun `findAt returns a comment whose key git cannot resolve`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val wanted = book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "fix this")

            val found = book(repo).findAt(FolderStore.WORKTREE, wanted.id)

            assertEquals(wanted.id, found?.id, "a migrated comment still names the key of its old folder store")
            assertEquals("fix this", found?.comment?.description)
        }
    }

    @Test
    fun `findAt returns nothing for an unknown id`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "x")

            assertNull(book(repo).findAt(FolderStore.WORKTREE, "0000000000000000000000000000000000000000"))
        }
    }
}
