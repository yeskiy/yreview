package com.yeskiy.yreview.store

import java.nio.file.Files
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class NotesWriteException(message: String) : RuntimeException(message)

/**
 * Reads and writes git notes. A write moves the ref only if no other writer moved it after the
 * read, and one lock for each repository and ref serializes the writers of this IDE.
 */
class NotesGateway(private val git: GitRunner) : NoteStore {

    /**
     * The records of one note, and no record when the plugin cannot read that note.
     * [FolderNotes] answers the same way when a file fails, so both stores keep one contract.
     */
    override fun readLines(ref: String, commit: String): List<String> =
        try {
            readOrRefuse(ref, commit)
        } catch (refused: NotesWriteException) {
            emptyList()
        }

    /**
     * The records of one note. A commit without a note gives an exit code of git and no record.
     * An answer that the runner made states nothing, so it stops the caller.
     */
    override fun readOrRefuse(ref: String, commit: String): List<String> {
        val result = git.run("notes", "--ref", ref, "show", commit)
        if (!result.ok) {
            if (!result.ran) throw NotesWriteException(refusal("the note of $commit", result))
            return emptyList()
        }
        return result.stdout.lineSequence().filter { it.isNotBlank() }.toList()
    }

    override fun append(ref: String, commit: String, line: String) =
        guarded(ref) { tip ->
            val landed = swap(ref, tip) { scratch ->
                withFile(line, "git notes append failed") { path ->
                    listOf("notes", "--ref", scratch, "append", "-F", path, commit)
                }
            }
            if (landed) Unit else null
        }

    /**
     * Writes the whole note again, with these lines and nothing else. An empty list removes the
     * note of that commit. A blank line divides two lines, the same way that `git notes append` writes.
     */
    override fun rewrite(ref: String, commit: String, lines: List<String>) {
        edit(ref, commit) { lines }
    }

    /** Reads the note, writes [change] of it, and gives the lines that [change] got. */
    override fun edit(ref: String, commit: String, change: (List<String>) -> List<String>): List<String> =
        guarded(ref) { tip ->
            val before = readOrRefuse(ref, commit)
            val after = change(before)
            before.takeIf { after == before || swap(ref, tip) { scratch -> store(scratch, commit, after) } }
        }

    override fun commitsWithNotes(ref: String): List<String> =
        try {
            commitsOrRefuse(ref)
        } catch (refused: NotesWriteException) {
            emptyList()
        }

    /** A list the plugin cannot read stops the caller, the same way [readOrRefuse] does. */
    override fun commitsOrRefuse(ref: String): List<String> {
        val result = git.run("notes", "--ref", ref, "list")
        if (!result.ok) {
            if (!result.ran) throw NotesWriteException(refusal("the notes of $ref", result))
            return emptyList()
        }
        return result.stdout.lineSequence()
            .filter { it.isNotBlank() }
            .map { it.substringAfter(' ').trim() }
            .toList()
    }

    // --- Guarded write ---

    /** Runs [attempt] under the lock until one attempt gives an answer. Null means that the ref moved. */
    private fun <T : Any> guarded(ref: String, attempt: (tip: String?) -> T?): T =
        LOCKS.computeIfAbsent(lockKey(ref)) { ReentrantLock() }.withLock {
            (1..MAX_TRIES).firstNotNullOfOrNull { attempt(tip(ref)) }
        } ?: throw NotesWriteException(
            "Another program changed $ref during each of $MAX_TRIES writes, so the plugin wrote no record. Try again.",
        )

    /**
     * Builds the new note on a scratch ref that starts at [tip], and moves [ref] from [tip] to it.
     * False when another writer moved [ref] after [tip] was read.
     */
    private fun swap(ref: String, tip: String?, write: (scratch: String) -> Unit): Boolean {
        val scratch = "$SCRATCH_PREFIX${UUID.randomUUID()}"
        try {
            tip?.let { check(git.run("update-ref", scratch, it), "git update-ref failed") }
            write(scratch)
            val built = tip(scratch) ?: throw NotesWriteException("git notes wrote no commit for $ref.")
            val moved = git.run("update-ref", ref, built, tip.orEmpty())
            if (moved.ok) return true
            if (tip(ref) == tip) check(moved, "git update-ref failed")
            return false
        } finally {
            git.run("update-ref", "-d", scratch)
        }
    }

    private fun store(scratch: String, commit: String, lines: List<String>) {
        if (lines.isEmpty()) {
            check(git.run("notes", "--ref", scratch, "remove", "--ignore-missing", commit), "git notes remove failed")
            return
        }
        withFile(lines.joinToString(SEPARATOR, postfix = "\n"), "git notes add failed") { path ->
            listOf("notes", "--ref", scratch, "add", "-f", "-F", path, commit)
        }
    }

    /** The commit that [ref] names, and null when the ref does not exist. */
    private fun tip(ref: String): String? {
        val result = git.run("rev-parse", "-q", "--verify", ref)
        if (result.ok) return result.stdout.trim()
        if (!result.ran) throw NotesWriteException(refusal(ref, result))
        return null
    }

    /** Two worktrees of one repository share the note refs, so the key is the common git directory. */
    private fun lockKey(ref: String): String {
        val result = git.run("rev-parse", "--path-format=absolute", "--git-common-dir")
        if (!result.ok) throw NotesWriteException(refusal("the git directory", result))
        return result.stdout.trim() + "\u0000" + ref
    }

    private fun check(result: GitResult, fallback: String) {
        if (!result.ok) throw NotesWriteException(result.stderr.trim().ifEmpty { fallback })
    }

    private fun refusal(what: String, result: GitResult): String =
        "The plugin did not read $what, so it wrote no record. ${result.stderr.trim()}".trim()

    /**
     * The note text goes through a file, never through an argument. On Windows, the process
     * builder does not escape a quote inside an argument, and git then splits a JSON line.
     */
    private fun withFile(text: String, fallback: String, args: (String) -> List<String>) {
        val file = Files.createTempFile("y-review-note", ".json").toFile()
        try {
            file.writeText(text)
            check(git.run(*args(file.absolutePath).toTypedArray()), fallback)
        } finally {
            file.delete()
        }
    }

    private companion object {
        const val SEPARATOR = "\n\n"

        /** The place of the scratch refs. No push and no fetch of the plugin names this place. */
        const val SCRATCH_PREFIX = "refs/notes/y-review/scratch/"

        const val MAX_TRIES = 5

        val LOCKS = ConcurrentHashMap<String, ReentrantLock>()
    }
}
