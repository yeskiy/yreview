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

    /** The messages of git for a commit that does not exist. Any other failure can pass on a retry. */
    private val NO_COMMIT = Regex(
        "bad object|bad revision|unknown revision|not a valid object name|invalid object name",
        RegexOption.IGNORE_CASE,
    )

    private const val MAX_ENTRIES = 4000

    private const val PATHS_PER_CALL = 100

    /**
     * Null when git refused the commit, or when git failed and a path has no good diff yet. A failed
     * run gives the last good diff of each path. A path that the diff does not name maps to null.
     */
    fun diffs(git: GitRunner, root: String, head: String, commit: String, paths: Collection<String>): Map<String, FileDiff?>? {
        if (!OBJECT_ID.matches(commit) || refused[root to commit] == head) return null
        val stamps = paths.associateWith { stampOf(root, it) }
        val known = paths.mapNotNull { path ->
            cache[Key(root, commit, path)]?.takeIf { it.head == head && it.stamp == stamps[path] }?.let { path to it.diff }
        }.toMap()
        val answers = paths.filter { it !in known }.distinct().chunked(PATHS_PER_CALL).map { it to read(git, commit, it) }
        if (answers.any { (_, result) -> !result.ok && result.ran && NO_COMMIT.containsMatchIn(result.stderr) }) {
            refused[root to commit] = head
            return null
        }
        val earlier = answers.filter { !it.second.ok }.flatMap { it.first }.associateWith { path ->
            cache[Key(root, commit, path)]?.takeUnless { it.diff?.deleted == true }
        }
        val fresh = answers.filter { it.second.ok }.flatMap { (chunk, result) ->
            LineMap.parse(result.stdout).let { found -> chunk.map { it to found[it] } }
        }.toMap()
        if (cache.size + fresh.size > MAX_ENTRIES) cache.clear()
        fresh.forEach { (path, diff) -> cache[Key(root, commit, path)] = Entry(head, stamps.getValue(path), diff) }
        return if (earlier.values.any { it == null }) null else known + fresh + earlier.mapValues { it.value?.diff }
    }

    fun forget() {
        cache.clear()
        refused.clear()
    }

    private fun read(git: GitRunner, commit: String, paths: List<String>): GitResult =
        git.run(
            "--literal-pathspecs", "-c", "core.quotePath=false", "diff", "-U0", "--no-color", "--no-ext-diff",
            "--no-renames", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", commit, "--", *paths.toTypedArray(),
        )

    private fun stampOf(root: String, path: String): String = runCatching {
        Path.of(root, path).let { "${Files.size(it)}:${Files.getLastModifiedTime(it).toMillis()}" }
    }.getOrDefault("missing")
}
