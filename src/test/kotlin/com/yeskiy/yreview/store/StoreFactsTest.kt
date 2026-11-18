package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class StoreFactsTest {

    private class Probe(private val answer: RepositoryFact? = RepositoryFact("/r", "abc")) {
        val asked = mutableListOf<String>()
        fun ask(dir: String): RepositoryFact? = answer.also { asked.add(dir) }
    }

    @Test
    fun `a second read of the same folder inside the time limit asks git once`() {
        val probe = Probe()
        val facts = StoreFacts(probe::ask, clock = { 0 })

        assertEquals(RepositoryFact("/r", "abc"), facts.repositoryOf("/r/a"))
        assertEquals(RepositoryFact("/r", "abc"), facts.repositoryOf("/r/a"))
        assertEquals(listOf("/r/a"), probe.asked)
    }

    @Test
    fun `a folder outside every repository is cached too`() {
        val probe = Probe(answer = null)
        val facts = StoreFacts(probe::ask, clock = { 0 })

        assertNull(facts.repositoryOf("/x"))
        assertNull(facts.repositoryOf("/x"))
        assertEquals(1, probe.asked.size)
        assertEquals(StoreFacts.Cached(null), facts.cached("/x"))
    }

    @Test
    fun `forget makes the next read ask git again`() {
        val probe = Probe()
        val facts = StoreFacts(probe::ask, clock = { 0 })

        facts.repositoryOf("/r/a")
        facts.forget()
        facts.repositoryOf("/r/a")

        assertEquals(2, probe.asked.size)
        facts.forget()
        assertNull(facts.cached("/r/a"))
    }

    @Test
    fun `a read after the time limit asks git again`() {
        val probe = Probe()
        val now = longArrayOf(0)
        val facts = StoreFacts(probe::ask, clock = { now[0] }, ttlMs = 100)

        facts.repositoryOf("/r/a")
        now[0] = 100
        facts.repositoryOf("/r/a")

        assertEquals(2, probe.asked.size)
    }

    @Test
    fun `cached gives no answer before the first read`() {
        val facts = StoreFacts(Probe()::ask, clock = { 0 })

        assertNull(facts.cached("/r/a"))
        facts.repositoryOf("/r/a")
        assertEquals(StoreFacts.Cached(RepositoryFact("/r", "abc")), facts.cached("/r/a"))
    }

    @Test
    fun `the answer is cached under the repository root too`() {
        val facts = StoreFacts(Probe()::ask, clock = { 0 })

        facts.repositoryOf("/r/a/b")

        assertEquals(StoreFacts.Cached(RepositoryFact("/r", "abc")), facts.cached("/r"))
    }
}
