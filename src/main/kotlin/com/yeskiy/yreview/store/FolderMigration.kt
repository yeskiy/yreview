package com.yeskiy.yreview.store

/** How many record lines the migration moved, and the reason it stopped when it did. */
data class MigrationReport(val moved: Int, val problem: String?)

/**
 * Moves the records of a folder store into the git notes of a repository.
 *
 * The copy runs before the delete, and it verifies the target before the caller removes the
 * source. A line keeps its bytes, so a record keeps its identifier and a resolve record still
 * points at the record it closes. A second run adds nothing, because the copy skips an
 * identifier that the note already holds.
 */
object FolderMigration {

    fun copy(from: NoteStore, to: NoteStore, refs: List<String>, target: String): MigrationReport =
        refs.fold(MigrationReport(0, null)) { report, ref ->
            if (report.problem != null) report else copyRef(from, to, ref, target, report)
        }

    private fun copyRef(
        from: NoteStore,
        to: NoteStore,
        ref: String,
        target: String,
        report: MigrationReport,
    ): MigrationReport =
        from.commitsWithNotes(ref).fold(report) { carried, key ->
            if (carried.problem != null) carried else copyKey(from, to, ref, key, target, carried)
        }

    private fun copyKey(
        from: NoteStore,
        to: NoteStore,
        ref: String,
        key: String,
        target: String,
        report: MigrationReport,
    ): MigrationReport {
        val source = from.readLines(ref, key)
        if (source.isEmpty()) return report
        val known: Set<String?> = idsOf(to.readLines(ref, target))
        val missing = source.filter { idOf(it) !in known }
        missing.forEach { to.append(ref, target, it) }
        val after = idsOf(to.readLines(ref, target))
        val lost = source.mapNotNull { idOf(it) }.filterNot { it in after }
        if (lost.isNotEmpty()) {
            return MigrationReport(report.moved, "The note of $ref did not take ${lineCount(lost.size)}.")
        }
        return MigrationReport(report.moved + missing.size, null)
    }

    private fun lineCount(value: Int): String = "$value record line${if (value == 1) "" else "s"}"

    private fun idsOf(lines: List<String>): Set<String> = lines.mapNotNull { idOf(it) }.toSet()

    /** A line the reader cannot decode has no identifier, so the copy always carries it. */
    private fun idOf(line: String): String? = runCatching { CommentJson.decode(line).id() }.getOrNull()
}
