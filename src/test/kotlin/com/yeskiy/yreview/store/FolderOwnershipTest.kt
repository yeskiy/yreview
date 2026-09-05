package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A repository can carry a folder of the same name as the folder store. The records inside
 * it belong to the person who wrote the commit, so the plugin must leave that folder alone.
 */
class FolderOwnershipTest {

    private fun record(repo: TempRepo, folder: String) {
        val notes = File(repo.dir, "$folder/${FolderStore.NOTES}")
        notes.mkdirs()
        File(notes, "refs-notes-devtools-discuss${FolderStore.SUFFIX}").writeText("{\"id\":\"one\"}\n")
    }

    private fun commitAll(repo: TempRepo) {
        check(repo.git.run("add", "-A").ok)
        check(repo.git.run("commit", "-q", "-m", "add the folder").ok)
    }

    private fun withPlainFolder(body: (File) -> Unit) {
        val root = Files.createTempDirectory("y-review-plain").toFile()
        try {
            body(root)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `a folder that git tracks is refused`() {
        TempRepo().use { repo ->
            record(repo, FolderStore.FOLDER)
            commitAll(repo)

            assertTrue(FolderOwnership.tracked(repo.git))
            assertFalse(FolderOwnership.mayMigrate(repo.git))
        }
    }

    @Test
    fun `a folder that git does not track is allowed`() {
        TempRepo().use { repo ->
            repo.commit("a.kt", "one")
            record(repo, FolderStore.FOLDER)

            assertFalse(FolderOwnership.tracked(repo.git))
            assertTrue(FolderOwnership.mayMigrate(repo.git))
        }
    }

    @Test
    fun `a folder in no repository at all is allowed`() {
        withPlainFolder { root ->
            File(root, FolderStore.FOLDER).mkdirs()

            assertFalse(FolderOwnership.tracked(ProcessGitRunner(root)))
            assertTrue(FolderOwnership.mayMigrate(ProcessGitRunner(root)))
        }
    }

    @Test
    fun `the answer names this folder alone, and no path a pattern would reach`() {
        TempRepo().use { repo ->
            val name = "[a-y]-review"
            repo.commit("x-review", "one")
            record(repo, name)

            assertFalse(FolderOwnership.tracked(repo.git, name))
            assertTrue(FolderOwnership.mayMigrate(repo.git, name))
        }
    }
}
