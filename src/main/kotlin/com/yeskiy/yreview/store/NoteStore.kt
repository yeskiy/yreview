package com.yeskiy.yreview.store

/**
 * One place that holds review records, named by a ref and by a key.
 *
 * The git notes of a repository are one such place, and there the key is a commit. The
 * .y-review folder of a project that no repository covers is the other, and there the key
 * names the working tree. Both places hold the same record lines.
 */
interface NoteStore {

    /**
     * The records of one key, and no record for a place the plugin cannot read.
     *
     * A caller that shows records reads through this door, because a display of nothing is
     * better than a display of an error. A caller that writes reads through [readOrRefuse].
     */
    fun readLines(ref: String, commit: String): List<String>

    /**
     * The records of one key. A place the plugin cannot read stops the caller.
     *
     * A key that holds no record gives an empty list, and that is not a failure. Every other
     * empty answer throws, so a write never takes a failed read for an empty place.
     */
    fun readOrRefuse(ref: String, commit: String): List<String>

    fun append(ref: String, commit: String, line: String)

    fun rewrite(ref: String, commit: String, lines: List<String>)

    /** The keys that hold a record, and no key for a store the plugin cannot read. */
    fun commitsWithNotes(ref: String): List<String>

    /** The keys that hold a record. A store the plugin cannot read stops the caller. */
    fun commitsOrRefuse(ref: String): List<String>
}
