package com.yeskiy.yreview.store

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap

/** The diff of each path from a comment commit to the working tree, read in one git process per commit. */
object DiffCache {

    private data class Key(val root: String, val commit: String, val path: String)

    private data class Entry(val head: String, val stamp: String, val diff: FileDiff?)

    private val cache = ConcurrentHashMap<Key, Entry>()

    private val refused = ConcurrentHashMap<Pair<String, String>, String>()

    private val OBJECT_ID = Regex("^[0-9a-f]{40}([0-9a-f]{24})?$")

    private const val MAX_ENTRIES = 4000

    private const val PATHS_PER_CALL = 100

    /** Null when git refused the commit. A path that the diff does not name maps to null. */
    fun diffs(git: GitRunner, root: String, head: String, commit: String, paths: Collection<String>): Map<String, FileDiff?>? {
        if (!OBJECT_ID.matches(commit) || refused[root to commit] == head) return null
        val stamps = paths.associateWith { stampOf(root, it) }
        val known = paths.mapNotNull { path ->
            cache[Key(root, commit, path)]?.takeIf { it.head == head && it.stamp == stamps[path] }?.let { path to it.diff }
        }.toMap()
        val fresh = paths.filter { it !in known }.distinct().chunked(PATHS_PER_CALL).flatMap { chunk ->
            val found = read(git, commit, chunk) ?: return null.also { refused[root to commit] = head }
            chunk.map { it to found[it] }
        }.toMap()
        if (cache.size + fresh.size > MAX_ENTRIES) cache.clear()
        fresh.forEach { (path, diff) -> cache[Key(root, commit, path)] = Entry(head, stamps.getValue(path), diff) }
        return known + fresh
    }

    fun forget() {
        cache.clear()
        refused.clear()
    }

    private fun read(git: GitRunner, commit: String, paths: List<String>): Map<String, FileDiff>? {
        val result = git.run(
            "--literal-pathspecs", "-c", "core.quotePath=false", "diff", "-U0", "--no-color", "--no-ext-diff",
            "--no-renames", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", commit, "--", *paths.toTypedArray(),
        )
        return if (result.ok) LineMap.parse(result.stdout) else null
    }

    private fun stampOf(root: String, path: String): String = runCatching {
        Path.of(root, path).let { "${Files.size(it)}:${Files.getLastModifiedTime(it).toMillis()}" }
    }.getOrDefault("missing")
}
