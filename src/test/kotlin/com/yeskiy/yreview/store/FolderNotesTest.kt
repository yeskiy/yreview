package com.yeskiy.yreview.store

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FolderNotesTest {

    private fun withRoot(body: (Path) -> Unit) {
        val root = Files.createTempDirectory("y-review-folder")
        try {
            body(root)
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    @Test
    fun `an empty store reads nothing`() {
        withRoot { root ->
            assertEquals(emptyList(), FolderNotes(root).readLines(NoteRefs.LOCAL, FolderStore.WORKTREE))
            assertEquals(emptyList(), FolderNotes(root).commitsWithNotes(NoteRefs.LOCAL))
        }
    }

    @Test
    fun `an appended line reads back and the folder appears`() {
        withRoot { root ->
            val store = FolderNotes(root)
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"a":1}""")
            assertEquals(listOf("""{"a":1}"""), store.readLines(NoteRefs.LOCAL, FolderStore.WORKTREE))
            assertTrue(Files.isDirectory(root.resolve(FolderStore.FOLDER)))
        }
    }

    @Test
    fun `two lines keep their order`() {
        withRoot { root ->
            val store = FolderNotes(root)
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"a":1}""")
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"b":2}""")
            assertEquals(
                listOf("""{"a":1}""", """{"b":2}"""),
                store.readLines(NoteRefs.LOCAL, FolderStore.WORKTREE),
            )
        }
    }

    @Test
    fun `two refs keep separate files`() {
        withRoot { root ->
            val store = FolderNotes(root)
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"a":1}""")
            store.append(NoteRefs.DISCUSS, FolderStore.WORKTREE, """{"b":2}""")
            assertEquals(listOf("""{"a":1}"""), store.readLines(NoteRefs.LOCAL, FolderStore.WORKTREE))
            assertEquals(listOf("""{"b":2}"""), store.readLines(NoteRefs.DISCUSS, FolderStore.WORKTREE))
        }
    }

    @Test
    fun `a rewrite with fewer lines drops the rest`() {
        withRoot { root ->
            val store = FolderNotes(root)
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"a":1}""")
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"b":2}""")
            store.rewrite(NoteRefs.LOCAL, FolderStore.WORKTREE, listOf("""{"b":2}"""))
            assertEquals(listOf("""{"b":2}"""), store.readLines(NoteRefs.LOCAL, FolderStore.WORKTREE))
        }
    }

    @Test
    fun `an empty rewrite removes the file and the key`() {
        withRoot { root ->
            val store = FolderNotes(root)
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"a":1}""")
            store.rewrite(NoteRefs.LOCAL, FolderStore.WORKTREE, emptyList())
            assertEquals(emptyList(), store.commitsWithNotes(NoteRefs.LOCAL))
            assertFalse(Files.exists(FolderNotes(root).fileOf(NoteRefs.LOCAL, FolderStore.WORKTREE)))
        }
    }

    @Test
    fun `the key list names every file of the ref`() {
        withRoot { root ->
            val store = FolderNotes(root)
            store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"a":1}""")
            store.append(NoteRefs.LOCAL, "abc123", """{"b":2}""")
            assertEquals(setOf(FolderStore.WORKTREE, "abc123"), store.commitsWithNotes(NoteRefs.LOCAL).toSet())
        }
    }

    @Test
    fun `a ref slug holds no path separator`() {
        assertEquals("refs-notes-y-review-local", FolderStore.slug(NoteRefs.LOCAL))
        assertEquals("refs-notes-devtools-discuss", FolderStore.slug(NoteRefs.DISCUSS))
    }
    @Test
    fun `an append keeps the records of a file that the plugin cannot read`() {
        withRoot { root ->
            val store = FolderNotes(root)
            val file = unreadable(store)
            val before = Files.readAllBytes(file)

            assertFailsWith<NotesWriteException> {
                store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"b":2}""")
            }

            assertContentEquals(before, Files.readAllBytes(file), "a failed read must write nothing")
        }
    }

    @Test
    fun `the refusal names the file that the plugin cannot read`() {
        withRoot { root ->
            val store = FolderNotes(root)
            val file = unreadable(store)

            val failure = assertFailsWith<NotesWriteException> {
                store.append(NoteRefs.LOCAL, FolderStore.WORKTREE, """{"b":2}""")
            }

            assertTrue(failure.message.orEmpty().contains(file.toString()), failure.message.orEmpty())
        }
    }

    @Test
    fun `a file that the plugin cannot read gives no line`() {
        withRoot { root ->
            val store = FolderNotes(root)
            unreadable(store)
            assertEquals(emptyList(), store.readLines(NoteRefs.LOCAL, FolderStore.WORKTREE))
        }
    }

    /**
     * Writes one record and a byte that no UTF-8 text holds. The reader of the file then
     * fails, and the store must tell that failure from an empty file.
     */
    private fun unreadable(store: FolderNotes): Path {
        val file = store.fileOf(NoteRefs.LOCAL, FolderStore.WORKTREE)
        Files.createDirectories(file.parent)
        Files.write(file, """{"a":1}""".toByteArray(StandardCharsets.UTF_8) + byteArrayOf(NEWLINE, BROKEN, NEWLINE))
        return file
    }

    private companion object {
        /** A byte that stands in no valid UTF-8 sequence. */
        const val BROKEN: Byte = -1

        const val NEWLINE: Byte = 10
    }
}
