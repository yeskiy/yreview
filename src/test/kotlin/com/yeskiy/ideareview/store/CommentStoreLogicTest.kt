package com.yeskiy.ideareview.store

import com.yeskiy.ideareview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
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
}
