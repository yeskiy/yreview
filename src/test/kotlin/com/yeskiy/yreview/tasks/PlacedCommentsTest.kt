package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.Carry
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PlacedCommentsTest {

    private val six = (1..6).joinToString("") { "l$it\n" }

    @AfterTest
    fun forget() = DiffCache.forget()

    private fun TempRepo.head() = git.run("rev-parse", "HEAD").stdout.trim()

    private fun TempRepo.note(commit: String, start: Int, end: Int, text: String = "Look here."): StoredComment =
        CommentBook(NotesGateway(git), "t@example.com").add(NoteRefs.LOCAL, commit, "a.txt", Range(startLine = start, endLine = end), text)

    private fun TempRepo.placed(path: String? = "a.txt") = PlacedComments.of(git, dir.path, head(), path)

    @Test
    fun `a new commit with the file unchanged keeps the lines`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", six)
        repo.note(old, 5, 6)
        repo.commit("b.txt", "other\n")
        assertEquals(Carry.Same(Range(startLine = 5, endLine = 6)), repo.placed().single().carry)
    }

    @Test
    fun `lines added above move the range`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", six)
        repo.note(old, 5, 6)
        repo.commit("a.txt", "n1\nn2\n$six")
        assertEquals(Carry.Same(Range(startLine = 7, endLine = 8)), repo.placed().single().carry)
    }

    @Test
    fun `changed commented lines make the comment outdated with the original text`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", six)
        repo.note(old, 5, 6)
        repo.commit("a.txt", six.replace("l5", "x5"))
        assertEquals(Carry.Outdated(Range(startLine = 5, endLine = 6), listOf("l5", "l6")), repo.placed().single().carry)
    }

    @Test
    fun `a removed file gives gone`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", six)
        repo.note(old, 5, 6)
        repo.git.run("rm", "-q", "a.txt")
        repo.git.run("commit", "-q", "-m", "drop")
        assertEquals(Carry.Gone, repo.placed().single().carry)
    }

    @Test
    fun `a branch switch with an equal file keeps the lines`() = TempRepo().use { repo ->
        val base = repo.commit("a.txt", six)
        repo.git.run("checkout", "-q", "-b", "side")
        val side = repo.commit("b.txt", "side\n")
        repo.note(side, 2, 3)
        repo.git.run("checkout", "-q", "-")
        repo.commit("c.txt", "main\n")
        assertTrue(repo.head() != side && repo.head() != base)
        assertEquals(Carry.Same(Range(startLine = 2, endLine = 3)), repo.placed().single().carry)
    }

    @Test
    fun `a comment of a commit that is not an ancestor maps by content`() = TempRepo().use { repo ->
        repo.commit("a.txt", six)
        repo.git.run("checkout", "-q", "-b", "side")
        val side = repo.commit("a.txt", "s1\n$six")
        repo.note(side, 6, 7)
        repo.git.run("checkout", "-q", "-")
        repo.commit("a.txt", "m1\nm2\n$six")
        assertEquals(Carry.Same(Range(startLine = 7, endLine = 8)), repo.placed().single().carry)
    }

    @Test
    fun `a comment of HEAD keeps its lines without a diff on a dirty file`() = TempRepo().use { repo ->
        val head = repo.commit("a.txt", six)
        repo.note(head, 5, 6)
        File(repo.dir, "a.txt").writeText("n1\n$six")
        assertEquals(Carry.Same(Range(startLine = 5, endLine = 6)), repo.placed().single().carry)
    }

    @Test
    fun `resolve and delete of a carried comment change the note of its commit`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", six)
        repo.note(old, 1, 1, "Resolve me.")
        repo.note(old, 2, 2, "Delete me.")
        repo.commit("a.txt", "n1\n$six")
        val book = CommentBook(NotesGateway(repo.git), "t@example.com")
        val placed = repo.placed()
        book.resolve(placed.first { it.stored.comment.description == "Resolve me." }.stored)
        book.remove(listOf(placed.first { it.stored.comment.description == "Delete me." }.stored))

        assertEquals(emptyList(), repo.placed())
        assertEquals(emptyList(), book.list(repo.head()))
        assertEquals(1, book.closed(old).size)
    }

    @Test
    fun `blank text and a path outside the root show nowhere`() = TempRepo().use { repo ->
        val head = repo.commit("a.txt", six)
        repo.note(head, 1, 1, "  ")
        CommentBook(NotesGateway(repo.git), "t@example.com").add(NoteRefs.LOCAL, head, "../x.txt", Range(startLine = 1, endLine = 1), "Out.")
        assertEquals(emptyList(), repo.placed(null))
    }

    @Test
    fun `a comment on uncommitted lines stays on its text after the commit`() = TempRepo().use { repo ->
        val head = repo.commit("a.txt", "a\nb\nd\n")
        File(repo.dir, "a.txt").writeText("a\nb\nnew line\nd\n")
        CommentBook(NotesGateway(repo.git), "t@example.com")
            .add(NoteRefs.LOCAL, head, "a.txt", Range(startLine = 3, endLine = 3), "Fix this.", lineText = "new line")
        repo.git.run("commit", "-q", "-am", "agent")
        assertEquals(Carry.Same(Range(startLine = 3, endLine = 3)), repo.placed().single().carry)
    }
}
