package com.yeskiy.yreview.store

import java.nio.file.Files

class NotesWriteException(message: String) : RuntimeException(message)

class NotesGateway(private val git: GitRunner) : NoteStore {

    /**
     * The records of one note, and no record when the plugin cannot read that note.
     *
     * [FolderNotes] answers the same way when a file fails, so both stores keep one contract.
     * A caller that shows records therefore needs no second path.
     */
    override fun readLines(ref: String, commit: String): List<String> =
        try {
            readOrRefuse(ref, commit)
        } catch (refused: NotesWriteException) {
            emptyList()
        }

    /**
     * The records of one note. A note the plugin cannot read stops the caller.
     *
     * A commit that carries no note gives an exit code of git itself, and no record is the
     * right answer. A note that passed the limit of the runner and a git that never started
     * both give a failed answer that states nothing, and neither one is an empty note.
     */
    override fun readOrRefuse(ref: String, commit: String): List<String> {
        val result = git.run("notes", "--ref", ref, "show", commit)
        if (!result.ok) {
            if (!result.answered) throw NotesWriteException(refusal("the note of $commit", result))
            return emptyList()
        }
        return result.stdout.lineSequence().filter { it.isNotBlank() }.toList()
    }

    override fun append(ref: String, commit: String, line: String) =
        withFile(line, "git notes append failed") { path ->
            listOf("notes", "--ref", ref, "append", "-F", path, commit)
        }

    /**
     * Writes the whole note again, with these lines and nothing else.
     *
     * An empty list removes the note of that commit, and the ref stays valid. A blank line
     * divides two lines, because `git notes append` writes the note that way. A rewrite adds
     * one commit to the note ref, so a later push of that ref stays a fast forward.
     */
    override fun rewrite(ref: String, commit: String, lines: List<String>) {
        if (lines.isEmpty()) {
            val result = git.run("notes", "--ref", ref, "remove", "--ignore-missing", commit)
            if (!result.ok) throw NotesWriteException(result.stderr.trim().ifEmpty { "git notes remove failed" })
            return
        }
        withFile(lines.joinToString(SEPARATOR, postfix = "\n"), "git notes add failed") { path ->
            listOf("notes", "--ref", ref, "add", "-f", "-F", path, commit)
        }
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
            if (!result.answered) throw NotesWriteException(refusal("the notes of $ref", result))
            return emptyList()
        }
        return result.stdout.lineSequence()
            .filter { it.isNotBlank() }
            .map { it.substringAfter(' ').trim() }
            .toList()
    }

    private fun refusal(what: String, result: GitResult): String =
        "The plugin did not read $what, so it wrote no record. ${result.stderr.trim()}".trim()

    /**
     * The note text goes through a file, never through an argument. On Windows the Java
     * process builder wraps an argument that holds a space in quotes without escaping the
     * quotes already inside it, so git splits a JSON line into several arguments and
     * reports "too many arguments".
     */
    private fun withFile(text: String, fallback: String, args: (String) -> List<String>) {
        val file = Files.createTempFile("y-review-note", ".json").toFile()
        try {
            file.writeText(text)
            val result = git.run(*args(file.absolutePath).toTypedArray())
            if (!result.ok) throw NotesWriteException(result.stderr.trim().ifEmpty { fallback })
        } finally {
            file.delete()
        }
    }

    private companion object {
        const val SEPARATOR = "\n\n"
    }
}
