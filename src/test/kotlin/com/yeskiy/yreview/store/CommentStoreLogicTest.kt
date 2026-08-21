package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CommentStoreLogicTest {

    private fun book(repo: TempRepo, now: Long = 1787194427L) =
        CommentBook(NotesGateway(repo.git), author = "39830788+yeskiy@users.noreply.github.com", clock = { now })

    @Test
    fun `writes a comment that reads back with its anchor`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val stored = book(repo).add(NoteRefs.LOCAL, head, "a.kt", 88, 94, "fix this")
            val read = book(repo).list(head).single()
            assertEquals(stored.id, read.id)
            assertEquals("a.kt", read.comment.location?.path)
            assertEquals(88, read.comment.location?.range?.startLine)
            assertEquals(94, read.comment.location?.range?.endLine)
            assertEquals("fix this", read.comment.description)
        }
    }

    @Test
    fun `stamps a ten digit timestamp and the author`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val stored = book(repo).add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
            assertEquals("1787194427", stored.comment.timestamp)
            assertEquals(10, stored.comment.timestamp.length)
            assertEquals("39830788+yeskiy@users.noreply.github.com", stored.comment.author)
        }
    }

    @Test
    fun `reads every ref and reports which one holds the comment`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "private")
            store.add(NoteRefs.DISCUSS, head, "a.kt", 2, 2, "shared")
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
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
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
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
            store.resolve(first)
            assertTrue(book(repo).open(head).isEmpty())
        }
    }

    @Test
    fun `an unresolved comment is listed as open`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
            assertEquals(1, book(repo).open(head).size)
        }
    }

    @Test
    fun `a resolved comment is listed as closed`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val store = book(repo)
            val first = store.add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
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
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
            assertTrue(book(repo).closed(head).isEmpty())
        }
    }

    @Test
    fun `commits reports every revision that carries a note`() {
        TempRepo().use { repo ->
            val first = repo.commit("a.kt", "one")
            val second = repo.commit("b.kt", "two")
            val store = book(repo)
            store.add(NoteRefs.LOCAL, first, "a.kt", 1, 1, "x")
            store.add(NoteRefs.DISCUSS, second, "b.kt", 1, 1, "y")

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
            val wanted = book(repo).add(NoteRefs.DISCUSS, second, "b.kt", 4, 6, "look here")

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
            book(repo).add(NoteRefs.LOCAL, head, "a.kt", 1, 1, "x")
            assertNull(book(repo).find("0000000000000000000000000000000000000000"))
        }
    }
}
