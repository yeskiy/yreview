package com.yeskiy.yreview.store

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FolderBookTest {

    private val now = 1_700_000_000L

    private fun withBook(body: (CommentBook, Path) -> Unit) {
        val root = Files.createTempDirectory("y-review-book")
        try {
            body(CommentBook(FolderNotes(root), author = "a@b.c", clock = { now }), root)
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    @Test
    fun `a comment reads back with the worktree key`() {
        withBook { book, _ ->
            val stored = book.add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 88, endLine = 94), "fix this")
            val read = book.list(FolderStore.WORKTREE).single()
            assertEquals(stored.id, read.id)
            assertEquals(FolderStore.WORKTREE, read.commit)
            assertEquals(FolderStore.WORKTREE, read.comment.location?.commit)
            assertEquals("fix this", read.comment.description)
        }
    }

    @Test
    fun `the key list names the worktree key`() {
        withBook { book, _ ->
            book.add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
            assertEquals(listOf(FolderStore.WORKTREE), book.commits())
        }
    }

    @Test
    fun `a resolved comment leaves the open list`() {
        withBook { book, _ ->
            val stored = book.add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
            book.resolve(stored)
            assertTrue(book.open(FolderStore.WORKTREE).isEmpty())
            assertEquals(listOf(stored.id), book.closed(FolderStore.WORKTREE).map { it.id })
        }
    }

    @Test
    fun `a delete removes the record and its resolve line`() {
        withBook { book, _ ->
            val stored = book.add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
            book.resolve(stored)
            assertEquals(2, book.remove(listOf(stored)))
            assertTrue(book.list(FolderStore.WORKTREE).isEmpty())
        }
    }

    @Test
    fun `find reaches a record without a known key`() {
        withBook { book, _ ->
            val stored = book.add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
            assertEquals(stored.id, book.find(stored.id)?.id)
        }
    }
}
