package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** A store that takes an append and keeps nothing, which is what a failed note write looks like. */
private class DeafStore : NoteStore {

    override fun readLines(ref: String, commit: String): List<String> = emptyList()

    override fun append(ref: String, commit: String, line: String) = Unit

    override fun rewrite(ref: String, commit: String, lines: List<String>) = Unit

    override fun commitsWithNotes(ref: String): List<String> = emptyList()
}

class FolderMigrationTest {

    private val now = 1_700_000_000L

    private fun withFolder(body: (Path) -> Unit) {
        val root = Files.createTempDirectory("y-review-migrate")
        try {
            body(root)
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    private fun bookOf(store: NoteStore) = CommentBook(store, author = "a@b.c", clock = { now })

    @Test
    fun `every record reaches the note and keeps its id`() {
        withFolder { root ->
            TempRepo().use { repo ->
                val head = repo.commit("a.kt", "one")
                val folder = FolderNotes(root)
                val first = bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
                val second = bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 2, endLine = 2), "two")

                val notes = NotesGateway(repo.git)
                val report = FolderMigration.copy(folder, notes, NoteRefs.ALL, head)

                assertNull(report.problem)
                assertEquals(2, report.moved)
                assertEquals(
                    setOf(first.id, second.id),
                    bookOf(notes).list(head).map { it.id }.toSet(),
                )
            }
        }
    }

    @Test
    fun `a second run adds no duplicate`() {
        withFolder { root ->
            TempRepo().use { repo ->
                val head = repo.commit("a.kt", "one")
                val folder = FolderNotes(root)
                bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
                val notes = NotesGateway(repo.git)

                FolderMigration.copy(folder, notes, NoteRefs.ALL, head)
                val again = FolderMigration.copy(folder, notes, NoteRefs.ALL, head)

                assertEquals(0, again.moved)
                assertNull(again.problem)
                assertEquals(1, bookOf(notes).list(head).size)
            }
        }
    }

    @Test
    fun `the ref of each record stays what it was`() {
        withFolder { root ->
            TempRepo().use { repo ->
                val head = repo.commit("a.kt", "one")
                val folder = FolderNotes(root)
                bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "local one")
                bookOf(folder).add(NoteRefs.DISCUSS, FolderStore.WORKTREE, "a.kt", Range(startLine = 2, endLine = 2), "shared one")
                val notes = NotesGateway(repo.git)

                FolderMigration.copy(folder, notes, NoteRefs.ALL, head)

                assertEquals(
                    listOf("local one"),
                    bookOf(notes).list(head, listOf(NoteRefs.LOCAL)).map { it.comment.description },
                )
                assertEquals(
                    listOf("shared one"),
                    bookOf(notes).list(head, listOf(NoteRefs.DISCUSS)).map { it.comment.description },
                )
            }
        }
    }

    @Test
    fun `a resolve record keeps its target after the move`() {
        withFolder { root ->
            TempRepo().use { repo ->
                val head = repo.commit("a.kt", "one")
                val folder = FolderNotes(root)
                val stored = bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")
                bookOf(folder).resolve(stored)
                val notes = NotesGateway(repo.git)

                FolderMigration.copy(folder, notes, NoteRefs.ALL, head)

                assertTrue(bookOf(notes).open(head).isEmpty())
                assertEquals(listOf(stored.id), bookOf(notes).closed(head).map { it.id })
            }
        }
    }

    @Test
    fun `a target that keeps no line reports a problem`() {
        withFolder { root ->
            val folder = FolderNotes(root)
            bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")

            val report = FolderMigration.copy(folder, DeafStore(), NoteRefs.ALL, "deadbeef")

            assertEquals(0, report.moved)
            assertEquals("The note of ${NoteRefs.LOCAL} did not take 1 record line.", report.problem)
        }
    }

    @Test
    fun `the copy leaves the folder untouched, so a crash before the move loses nothing`() {
        withFolder { root ->
            TempRepo().use { repo ->
                val head = repo.commit("a.kt", "one")
                val folder = FolderNotes(root)
                val stored = bookOf(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.kt", Range(startLine = 1, endLine = 1), "one")

                FolderMigration.copy(folder, NotesGateway(repo.git), NoteRefs.ALL, head)

                assertEquals(listOf(stored.id), bookOf(folder).list(FolderStore.WORKTREE).map { it.id })
                assertEquals(listOf(stored.id), bookOf(NotesGateway(repo.git)).list(head).map { it.id })
            }
        }
    }

    @Test
    fun `an empty folder store reports nothing to move`() {
        withFolder { root ->
            TempRepo().use { repo ->
                val head = repo.commit("a.kt", "one")
                val report = FolderMigration.copy(FolderNotes(root), NotesGateway(repo.git), NoteRefs.ALL, head)
                assertEquals(0, report.moved)
                assertNull(report.problem)
            }
        }
    }

    @Test
    fun `a repository rooted at the folder may take the records`() {
        assertTrue(FolderMigration.maySettle("E:/Projects/site", "E:/Projects/site"))
    }

    @Test
    fun `a repository rooted above the folder may not take the records`() {
        assertFalse(FolderMigration.maySettle("E:/Projects/site", "E:/Projects/site/api"))
    }

    @Test
    fun `a repository beside the folder may not take the records`() {
        assertFalse(FolderMigration.maySettle("E:/Projects/other", "E:/Projects/site"))
    }

    // --- The lookup that may write ---

    @Test
    fun `a lookup that may write moves the records`() {
        assertTrue(FolderMigration.mayMove(writes = true, "E:/Projects/site", "E:/Projects/site"))
    }

    @Test
    fun `a lookup that may not write leaves the records where they are`() {
        assertFalse(FolderMigration.mayMove(writes = false, "E:/Projects/site", "E:/Projects/site"))
    }

    @Test
    fun `a lookup that may write still asks where the repository is rooted`() {
        assertFalse(FolderMigration.mayMove(writes = true, "E:/Projects/site", "E:/Projects/site/api"))
    }

    // --- What the user reads after the copy ---

    @Test
    fun `a copy that failed warns and asks for no new read`() {
        val notice = FolderMigration.notice(MigrationReport(0, "The note of x did not take 1 record line."), FOLDER, "site", null)

        assertTrue(notice.warning)
        assertFalse(notice.refresh)
        assertTrue(notice.text.contains("did not take 1 record line"), notice.text)
    }

    @Test
    fun `a copy whose folder stays warns and names the folder`() {
        val notice = FolderMigration.notice(MigrationReport(2, null), FOLDER, "site", null)

        assertTrue(notice.warning, "the user must read that the old folder is still there")
        assertTrue(notice.refresh, "the records sit in the git notes, so every reader reads them again")
        assertTrue(notice.text.contains(FOLDER.resolve(FolderStore.FOLDER).toString()), notice.text)
    }

    @Test
    fun `a copy that moved the folder says where the folder went`() {
        val kept = FOLDER.resolve(".git").resolve("y-review").resolve("migrated-1")

        val notice = FolderMigration.notice(MigrationReport(2, null), FOLDER, "site", kept)

        assertFalse(notice.warning)
        assertTrue(notice.refresh)
        assertTrue(notice.text.contains("2 review comments"), notice.text)
        assertTrue(notice.text.contains(kept.toString()), notice.text)
    }

    private companion object {
        val FOLDER: Path = Path.of("E:/Projects/site")
    }
}
