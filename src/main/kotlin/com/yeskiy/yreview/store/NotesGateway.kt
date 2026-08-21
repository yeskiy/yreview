package com.yeskiy.yreview.store

import java.nio.file.Files

class NotesWriteException(message: String) : RuntimeException(message)

class NotesGateway(private val git: GitRunner) {

    fun readLines(ref: String, commit: String): List<String> {
        val result = git.run("notes", "--ref", ref, "show", commit)
        if (!result.ok) return emptyList()
        return result.stdout.lineSequence().filter { it.isNotBlank() }.toList()
    }

    fun append(ref: String, commit: String, line: String) =
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
    fun rewrite(ref: String, commit: String, lines: List<String>) {
        if (lines.isEmpty()) {
            val result = git.run("notes", "--ref", ref, "remove", "--ignore-missing", commit)
            if (!result.ok) throw NotesWriteException(result.stderr.trim().ifEmpty { "git notes remove failed" })
            return
        }
        withFile(lines.joinToString(SEPARATOR, postfix = "\n"), "git notes add failed") { path ->
            listOf("notes", "--ref", ref, "add", "-f", "-F", path, commit)
        }
    }

    fun commitsWithNotes(ref: String): List<String> {
        val result = git.run("notes", "--ref", ref, "list")
        if (!result.ok) return emptyList()
        return result.stdout.lineSequence()
            .filter { it.isNotBlank() }
            .map { it.substringAfter(' ').trim() }
            .toList()
    }

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
