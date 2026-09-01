package com.yeskiy.yreview.store

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
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
}
