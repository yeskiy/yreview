package com.yeskiy.yreview.store

/**
 * One place that holds review records, named by a ref and by a key.
 *
 * The git notes of a repository are one such place, and there the key is a commit. The
 * .y-review folder of a project that no repository covers is the other, and there the key
 * names the working tree. Both places hold the same record lines.
 */
interface NoteStore {

    fun readLines(ref: String, commit: String): List<String>

    fun append(ref: String, commit: String, line: String)

    fun rewrite(ref: String, commit: String, lines: List<String>)

    fun commitsWithNotes(ref: String): List<String>
}
