package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DiffCacheTest {

    private val calls = mutableListOf<List<String>>()

    private fun counting(repo: TempRepo) = object : GitRunner {
        override fun run(vararg args: String): GitResult = repo.git.run(*args).also { calls.add(args.toList()) }
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
}
