package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** The author is part of the record identity, so no record gets an author that git did not give. */
class GitAuthorTest {

    private fun answering(result: GitResult) = object : GitRunner {
        override fun run(vararg args: String) = result
    }

    @Test
    fun `the author is the email that git gives`() {
        TempRepo().use { repo -> assertEquals("test@example.com", GitAuthor.of(repo.git)) }
    }

    @Test
    fun `a git that does not start gives no author`() {
        val failure = assertFailsWith<NotesWriteException> {
            GitAuthor.of(answering(GitResult(GitResult.DID_NOT_START, "", "The plugin could not start git.")))
        }
        assertTrue(failure.message.orEmpty().contains("start git"), failure.message)
    }

    @Test
    fun `a git without user email gives no author`() {
        val failure = assertFailsWith<NotesWriteException> { GitAuthor.of(answering(GitResult(1, "", ""))) }
        assertTrue(failure.message.orEmpty().contains("user.email"), failure.message)
    }

    @Test
    fun `a stopped run gives no author`() {
        assertFailsWith<NotesWriteException> {
            GitAuthor.of(answering(GitResult(GitResult.TIMED_OUT, "a@b.c", "stopped")))
        }
    }

    @Test
    fun `a book without an author writes no record and still reads`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            val missing = answering(GitResult(GitResult.DID_NOT_START, "", "The plugin could not start git."))
            val book = CommentBook(NotesGateway(repo.git), authorOf = { GitAuthor.of(missing) })

            assertFailsWith<NotesWriteException> {
                book.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "no author")
            }

            assertTrue(book.list(head).isEmpty())
            assertTrue(NotesGateway(repo.git).commitsWithNotes(NoteRefs.LOCAL).isEmpty())
        }
    }
}
