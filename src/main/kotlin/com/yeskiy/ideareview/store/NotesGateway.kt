package com.yeskiy.ideareview.store

import java.nio.file.Files

class NotesWriteException(message: String) : RuntimeException(message)

class NotesGateway(private val git: GitRunner) {

    fun readLines(ref: String, commit: String): List<String> {
        val result = git.run("notes", "--ref", ref, "show", commit)
        if (!result.ok) return emptyList()
        return result.stdout.lineSequence().filter { it.isNotBlank() }.toList()
    }

    /**
     * The note text goes through a file, never through an argument. On Windows the Java
     * process builder wraps an argument that holds a space in quotes without escaping the
     * quotes already inside it, so git splits a JSON line into several arguments and
     * reports "too many arguments".
     */
    fun append(ref: String, commit: String, line: String) {
        val file = Files.createTempFile("idea-review-note", ".json").toFile()
        try {
            file.writeText(line)
            val result = git.run("notes", "--ref", ref, "append", "-F", file.absolutePath, commit)
            if (!result.ok) throw NotesWriteException(result.stderr.trim().ifEmpty { "git notes append failed" })
        } finally {
            file.delete()
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
}
