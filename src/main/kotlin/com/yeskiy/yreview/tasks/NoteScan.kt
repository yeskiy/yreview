package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NoteStore
import java.util.concurrent.ConcurrentHashMap

/** Every note of the review refs of one repository, held in memory. It takes no write. */
class NoteSnapshot(private val notes: Map<String, Map<String, List<String>>>) : NoteStore {

    override fun readLines(ref: String, commit: String): List<String> = notes[ref]?.get(commit).orEmpty()

    override fun readOrRefuse(ref: String, commit: String): List<String> = readLines(ref, commit)

    override fun commitsWithNotes(ref: String): List<String> = notes[ref]?.keys?.toList().orEmpty()

    override fun commitsOrRefuse(ref: String): List<String> = commitsWithNotes(ref)

    override fun append(ref: String, commit: String, line: String) = throw UnsupportedOperationException(READ_ONLY)

    override fun rewrite(ref: String, commit: String, lines: List<String>) = throw UnsupportedOperationException(READ_ONLY)

    private companion object {
        const val READ_ONLY = "a note snapshot takes no write"
    }
}

/**
 * Reads every note of the review refs with `git for-each-ref` and one `git grep` of the moved tips.
 * A ref whose tip did not move comes from the cache, so a scan with no new note costs one process.
 */
object NoteScan {

    private data class Key(val root: String, val ref: String)

    private data class Entry(val tip: String, val notes: Map<String, List<String>>)

    private val cache = ConcurrentHashMap<Key, Entry>()

    private val OBJECT_ID = Regex("^[0-9a-f]{40}([0-9a-f]{24})?$")

    /** Null when git gave no full answer, so the caller reads each note in turn. */
    fun read(
        git: GitRunner,
        root: String,
        refs: List<String> = NoteRefs.ALL,
        checkCanceled: () -> Unit = {},
    ): NoteSnapshot? {
        val tips = tips(git, refs) ?: return null
        checkCanceled()
        val stale = tips.filter { (ref, tip) -> cache[Key(root, ref)]?.tip != tip }
        val fresh = if (stale.isEmpty()) emptyMap() else notesOf(git, stale.values.distinct()) ?: return null
        checkCanceled()
        refs.filter { it !in tips }.forEach { cache.remove(Key(root, it)) }
        return NoteSnapshot(
            tips.mapValues { (ref, tip) ->
                (cache[Key(root, ref)]?.takeIf { it.tip == tip } ?: Entry(tip, fresh[tip].orEmpty()).also { cache[Key(root, ref)] = it })
                    .notes
            },
        )
    }

    /** The tip of each ref that exists, in the order of [refs]. */
    private fun tips(git: GitRunner, refs: List<String>): Map<String, String>? {
        val result = git.run("for-each-ref", "--format=%(objectname)%09%(refname)", *refs.toTypedArray())
        if (!result.ok) return null
        val found = result.stdout.lineSequence()
            .map { it.trim().split('\t') }
            .filter { it.size == 2 && OBJECT_ID.matches(it[0]) }
            .associate { it[1] to it[0] }
        return refs.filter { it in found }.associateWith { found.getValue(it) }
    }

    /** The lines of every note by tip and by object. An output line is "tip:path", a NUL, and one note line. */
    private fun notesOf(git: GitRunner, tips: List<String>): Map<String, Map<String, List<String>>>? {
        val result = git.run(
            "grep", "-z", "-a", "-G", "--no-color", "--no-line-number", "--no-column", "-e", "^", *tips.toTypedArray(),
        )
        if (!result.answered || (result.exitCode != 0 && result.exitCode != NO_MATCH)) return null
        return result.stdout.split('\n')
            .mapNotNull { record ->
                val name = record.substringBefore('\u0000', "")
                val tip = name.substringBefore(':', "")
                val target = name.substringAfter(':', "").replace("/", "")
                if (tip.isEmpty() || !OBJECT_ID.matches(target)) null else Triple(tip, target, record.substringAfter('\u0000'))
            }
            .groupBy({ it.first }, { it.second to it.third })
            .mapValues { (_, lines) ->
                lines.groupBy({ it.first }, { it.second })
                    .mapValues { (_, note) -> note.flatMap { it.lineSequence() }.filter { it.isNotBlank() } }
                    .filterValues { it.isNotEmpty() }
            }
    }

    /** The exit code of `git grep` when no line matched. */
    private const val NO_MATCH = 1
}
