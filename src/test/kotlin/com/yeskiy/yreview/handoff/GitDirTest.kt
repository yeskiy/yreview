package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.ProcessGitRunner
import java.io.File
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GitDirTest {

    private fun real(path: Path): String = path.toRealPath().toString().replace('\\', '/')

    @Test
    fun `finds the git directory of a plain repository`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            assertEquals(real(File(repo.dir, ".git").toPath()), real(GitDir.of(repo.git)!!))
        }
    }

    @Test
    fun `finds the git directory of a worktree`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val tree = File(repo.dir.parentFile, "y-review-worktree-${System.nanoTime()}")
            try {
                assertTrue(repo.git.run("worktree", "add", tree.absolutePath, "-b", "side").ok)
                val found = GitDir.of(ProcessGitRunner(tree))!!
                assertTrue(real(found).endsWith("/worktrees/${tree.name}"), real(found))
                assertTrue(File(tree, ".git").isFile, "a worktree keeps a .git file, not a folder")
            } finally {
                tree.deleteRecursively()
            }
        }
    }

    @Test
    fun `gives nothing outside a repository`() {
        val folder = java.nio.file.Files.createTempDirectory("y-review-plain").toFile()
        try {
            assertNull(GitDir.of(ProcessGitRunner(folder)))
        } finally {
            folder.deleteRecursively()
        }
    }

    @Test
    fun `names the review folder inside the git directory`() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "one")
            val folder = GitDir.reviewFolder(repo.git)!!.toString().replace(File.separatorChar, '/')
            assertTrue(folder.endsWith("/.git/y-review"), folder)
        }
    }

    @Test
    fun `shortens a folder that sits inside the repository`() {
        assertEquals(
            ".git/y-review",
            GitDir.label(Path.of("E:/repo/.git/y-review"), Path.of("E:/repo")),
        )
    }

    @Test
    fun `keeps the whole path of a folder outside the repository`() {
        assertEquals(
            "E:/main/.git/worktrees/tree/y-review",
            GitDir.label(Path.of("E:/main/.git/worktrees/tree/y-review"), Path.of("E:/tree")),
        )
    }
}
