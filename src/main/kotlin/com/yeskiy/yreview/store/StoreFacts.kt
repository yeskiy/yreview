package com.yeskiy.yreview.store

import java.util.concurrent.ConcurrentHashMap

/** The git repository that holds a folder. [head] is null when the repository has no commit. */
data class RepositoryFact(val root: String, val head: String?)

/**
 * Keeps the git answer for each folder, so that one file does not start git on each read.
 * The answer is also kept under the repository root, so [cached] can tell the kind of a store root.
 */
class StoreFacts(
    private val probe: (String) -> RepositoryFact?,
    private val clock: () -> Long = System::currentTimeMillis,
    private val ttlMs: Long = 10_000,
) {

    /** One cached answer. [fact] is null for a folder outside every repository. */
    data class Cached(val fact: RepositoryFact?)

    private val answers = ConcurrentHashMap<String, Pair<Long, RepositoryFact?>>()

    /** Asks git when no answer is cached or the cached answer is older than the time limit. */
    fun repositoryOf(dir: String): RepositoryFact? {
        val now = clock()
        answers[dir]?.takeIf { now - it.first < ttlMs }?.let { return it.second }
        return probe(dir).also { fact ->
            answers[dir] = now to fact
            fact?.let { answers[it.root] = now to it }
        }
    }

    /** Starts no process. The answer can be older than the time limit, until [forget] runs. */
    fun cached(dir: String): Cached? = answers[dir]?.let { Cached(it.second) }

    fun forget() = answers.clear()
}
