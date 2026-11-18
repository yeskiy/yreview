package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class StoreSearchTest {

    /** Counts every git process of one search. */
    private class Counting(private val git: GitRunner) : GitRunner {
        val runs = AtomicInteger()
        override fun run(vararg args: String): GitResult = runs.incrementAndGet().let { git.run(*args) }
    }

    private fun store(repo: TempRepo, dir: String) {
        val notes = File(repo.dir, if (dir.isEmpty()) ".y-review/notes" else "$dir/.y-review/notes")
        File(notes, "refs-notes-y-review-local").apply { mkdirs() }.resolve("worktree.jsonl").writeText("{}\n")
    }

    private fun file(repo: TempRepo, path: String, text: String) =
        File(repo.dir, path).apply { parentFile.mkdirs() }.writeText(text)

    private fun rootOf(repo: TempRepo): String = repo.dir.toPath().toRealPath().toString().replace('\\', '/')

    /** The repository of the expected table, with one commit. */
    private fun table(repo: TempRepo) {
        repo.commit("README.md", "readme")
        store(repo, "")
        store(repo, "a/b")
        file(repo, ".gitignore", "ignored/\n")
        store(repo, "ignored")
        file(repo, "c/.gitignore", ".y-review/\n")
        store(repo, "c")
        File(repo.dir, "nested").mkdirs()
        check(ProcessGitRunner(File(repo.dir, "nested")).run("init", "-q").ok)
        store(repo, "nested")
        store(repo, "node_modules/x")
        store(repo, "tracked")
        check(repo.git.run("add", "tracked").ok)
        check(repo.git.run("commit", "-q", "-m", "track a store").ok)
    }

    private fun expected(root: String) = listOf(root, "$root/a/b", "$root/c")

    @Test
    fun `finds each untracked store root and skips ignored, nested, node_modules and tracked stores`() {
        TempRepo().use { repo ->
            table(repo)
            val root = rootOf(repo)

            assertEquals(expected(root), StoreSearch.childStores(ProcessGitRunner(File(root)), root))
        }
    }

    @Test
    fun `runs exactly two git processes`() {
        TempRepo().use { repo ->
            table(repo)
            val root = rootOf(repo)
            val git = Counting(ProcessGitRunner(File(root)))

            StoreSearch.childStores(git, root)

            assertEquals(2, git.runs.get())
        }
    }

    @Test
    fun `does not go into an ignored folder with many files`() {
        TempRepo().use { repo ->
            table(repo)
            file(repo, ".gitignore", "ignored/\nbuild/\n")
            (1..3_000).forEach { index -> file(repo, "build/out/f$index.txt", "x") }
            val root = rootOf(repo)
            val git = Counting(ProcessGitRunner(File(root)))

            val found = StoreSearch.childStores(git, root)

            assertEquals(2, git.runs.get())
            assertEquals(expected(root), found)
        }
    }

    @Test
    fun `keeps an ignored store folder only when it holds a notes folder`() {
        TempRepo().use { repo ->
            repo.commit("README.md", "readme")
            file(repo, ".gitignore", ".y-review/\n")
            file(repo, "d/.y-review/other.txt", "x")
            store(repo, "e")
            val root = rootOf(repo)

            assertEquals(listOf("$root/e"), StoreSearch.childStores(ProcessGitRunner(File(root)), root))
        }
    }

    @Test
    fun `gives null when git does not answer`() {
        val deaf = object : GitRunner {
            override fun run(vararg args: String) = GitResult(GitResult.DID_NOT_START, "", "")
        }

        assertNull(StoreSearch.childStores(deaf, "/repo"))
    }
}
