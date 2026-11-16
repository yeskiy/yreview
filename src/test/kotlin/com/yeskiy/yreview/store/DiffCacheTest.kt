package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DiffCacheTest {

    private val calls = mutableListOf<List<String>>()

    private fun counting(repo: TempRepo) = object : GitRunner {
        override fun run(vararg args: String): GitResult = repo.git.run(*args).also { calls.add(args.toList()) }
    }

    private var fail = true

    /** Gives [failure] while [fail] is true, else runs git. */
    private fun failing(repo: TempRepo, failure: GitResult) = object : GitRunner {
        override fun run(vararg args: String): GitResult = (if (fail) failure else repo.git.run(*args)).also { calls.add(args.toList()) }
    }

    @BeforeTest
    fun clear() = DiffCache.forget()

    @AfterTest
    fun forget() = DiffCache.forget()

    @Test
    fun `one call reads every path of one commit, and a second ask reads none`() = TempRepo().use { repo ->
        repo.commit("b.txt", "x\n")
        val old = repo.commit("a.txt", "1\n2\n")
        repo.commit("c.txt", "y\n")
        File(repo.dir, "a.txt").writeText("0\n1\n2\n")
        val head = repo.git.run("rev-parse", "HEAD").stdout.trim()
        val git = counting(repo)

        val first = DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt", "b.txt"))!!
        val second = DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt", "b.txt"))!!

        assertEquals(1, calls.size)
        assertEquals(listOf(Hunk(0, 0, 1, 1, emptyList())), first["a.txt"]?.hunks)
        assertNull(first["b.txt"])
        assertEquals(first, second)
    }

    @Test
    fun `a file write reads the diff again`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", "1\n")
        val git = counting(repo)
        DiffCache.diffs(git, repo.dir.path, old, old, listOf("a.txt"))
        File(repo.dir, "a.txt").writeText("1\n2\n3\n")

        val again = DiffCache.diffs(git, repo.dir.path, old, old, listOf("a.txt"))!!

        assertEquals(2, calls.size)
        assertEquals(2, again["a.txt"]?.hunks?.single()?.newCount)
    }

    @Test
    fun `an unknown commit gives null and asks git once until HEAD moves`() = TempRepo().use { repo ->
        val head = repo.commit("a.txt", "1\n")
        val git = counting(repo)
        val gone = "0".repeat(40)

        assertNull(DiffCache.diffs(git, repo.dir.path, head, gone, listOf("a.txt")))
        assertNull(DiffCache.diffs(git, repo.dir.path, head, gone, listOf("a.txt")))
        assertEquals(1, calls.size)
    }

    @Test
    fun `a value that is not an object name starts no git`() = TempRepo().use { repo ->
        val head = repo.commit("a.txt", "1\n")
        assertNull(DiffCache.diffs(counting(repo), repo.dir.path, head, "--output=x", listOf("a.txt")))
        assertEquals(0, calls.size)
    }

    @Test
    fun `a timeout is not kept, and the next ask runs git again`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", "1\n")
        val head = repo.commit("b.txt", "2\n")
        val git = failing(repo, TIMEOUT)

        assertNull(DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt")))
        fail = false
        assertTrue(DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt"))!!.containsKey("a.txt"))
        assertEquals(2, calls.size)
    }

    @Test
    fun `a failure on a lock file is not kept`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", "1\n")
        val head = repo.commit("b.txt", "2\n")
        val git = failing(repo, LOCKED)

        assertNull(DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt")))
        assertNull(DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt")))
        assertEquals(2, calls.size)
    }

    @Test
    fun `a bad revision stays refused until HEAD moves`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", "1\n")
        val head = repo.commit("b.txt", "2\n")
        val git = failing(repo, GitResult(128, "", "fatal: bad revision '$old'"))

        assertNull(DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt")))
        assertNull(DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt")))
        assertEquals(1, calls.size)
        DiffCache.diffs(git, repo.dir.path, old, old, listOf("a.txt"))
        assertEquals(2, calls.size)
    }

    @Test
    fun `a failed run gives the last good diff, and the next good run the new diff`() = TempRepo().use { repo ->
        val old = repo.commit("a.txt", "1\n")
        val head = repo.commit("b.txt", "2\n")
        File(repo.dir, "a.txt").writeText("0\n1\n")
        val git = failing(repo, TIMEOUT)
        fail = false
        val good = DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt"))
        File(repo.dir, "a.txt").writeText("0\n1\n2\n3\n")

        fail = true
        val during = DiffCache.diffs(git, repo.dir.path, old, old, listOf("a.txt"))
        fail = false
        val after = DiffCache.diffs(git, repo.dir.path, head, old, listOf("a.txt"))

        assertEquals(1, good?.get("a.txt")?.hunks?.size)
        assertEquals(good, during)
        assertEquals(2, after?.get("a.txt")?.hunks?.size)
        assertEquals(3, calls.size)
    }

    private companion object {
        val TIMEOUT = GitResult(GitResult.TIMED_OUT, "", "Git did not stop.")
        val LOCKED = GitResult(128, "", "fatal: Unable to create '.git/index.lock': File exists.")
    }
}
