package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.GitDirs
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteMove
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NoteStore
import com.yeskiy.yreview.store.NoteTips
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
 * Reads the tips from the git folder, or with `git for-each-ref`, and the moved tips with one `git grep`.
 * A ref whose tip did not move comes from the cache, so a scan of a repository root with no new note starts no git.
 */
object NoteScan {

    private data class Key(val root: String, val ref: String)

    private data class Entry(val tip: String, val notes: Map<String, List<String>>)

    private val cache = ConcurrentHashMap<Key, Entry>()

    /** Clears the cache, so the next read is cold. The bench and the tests call this. */
    internal fun forget() = cache.clear()

    private val OBJECT_ID = Regex("^[0-9a-f]{40}([0-9a-f]{24})?$")

    /** Null when git gave no full answer, so the caller reads each note in turn. */
    fun read(
        git: GitRunner,
        root: String,
        refs: List<String> = NoteRefs.ALL,
        checkCanceled: () -> Unit = {},
    ): NoteSnapshot? {
        val tips = GitDirs.commonDir(root)?.let { NoteTips.read(it, refs) } ?: tips(git, refs) ?: return null
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

    /**
     * A move of a note ref by this IDE. The entry changes only when it holds the tip before the move.
     * The notes stay sorted by object, the order of the `git grep` answer.
     */
    fun moved(root: String, move: NoteMove) {
        val key = Key(root, move.ref)
        if (move.from == null) {
            cache[key] = Entry(move.to, noteOf(move.commit, move.after(emptyList())))
            return
        }
        cache.computeIfPresent(key) { _, entry ->
            if (entry.tip != move.from) {
                null
            } else {
                Entry(move.to, (entry.notes - move.commit + noteOf(move.commit, move.after(entry.notes[move.commit].orEmpty()))).toSortedMap())
            }
        }
    }

    /** The lines of one note in the form of the grep answer: one line per record, no blank line. */
    private fun noteOf(commit: String, lines: List<String>): Map<String, List<String>> =
        lines.flatMap { it.lineSequence() }.filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.let { mapOf(commit to it) }.orEmpty()

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
        if (!result.ran || (result.exitCode != 0 && result.exitCode != NO_MATCH)) return null
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
