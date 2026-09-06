package com.yeskiy.yreview.store

import java.nio.file.Path

/** How many record lines the migration moved, and the reason it stopped when it did. */
data class MigrationReport(val moved: Int, val problem: String?)

/** What the user reads after a migration, and whether every reader must read the store again. */
data class MigrationNotice(val text: String, val warning: Boolean, val refresh: Boolean)

/**
 * Moves the records of a folder store into the git notes of a repository.
 *
 * The copy runs before the delete, and it verifies the target before the caller removes the
 * source. A line keeps its bytes, so a record keeps its identifier and a resolve record still
 * points at the record it closes. A second run adds nothing, because the copy skips an
 * identifier that the note already holds.
 */
object FolderMigration {

    /**
     * True when this repository may take the records of the folder store at that root.
     *
     * A record names its file under the root of the folder store. A repository that is
     * rooted above the folder gives every one of those names another meaning, and a record
     * would then point at a file that is not the file of the record. Only a repository that
     * is rooted at the folder itself may take the records.
     */
    fun maySettle(repositoryRoot: String, folderRoot: String): Boolean = repositoryRoot == folderRoot

    /**
     * True when one lookup of the stores may move the records of a folder store.
     *
     * The move writes the git notes and it moves a folder, so only a caller that may write
     * asks for it. A caller that answers a read passes false for [writes], and the records
     * then stay in the folder. The read still finds them there.
     */
    fun mayMove(writes: Boolean, repositoryRoot: String, folderRoot: String): Boolean =
        writes && maySettle(repositoryRoot, folderRoot)

    /**
     * What the user reads after the copy ran, and whether every reader reads the store again.
     *
     * A copy that failed leaves each record where it was, so no reader reads again. A copy
     * that worked puts every record in the git notes, so the tool window and the gutter read
     * again. That holds for a folder which stays behind too, because the records of that
     * folder now sit in the notes as well.
     *
     * [movedTo] is the new place of the old folder, and null when the folder stays.
     */
    fun notice(report: MigrationReport, folder: Path, repository: String, movedTo: Path?): MigrationNotice = when {
        report.problem != null -> MigrationNotice(
            "The plugin did not move the review comments of ${folder.fileName}. ${report.problem}",
            warning = true,
            refresh = false,
        )
        movedTo == null -> MigrationNotice(
            "The plugin copied ${commentCount(report.moved)} of ${folder.fileName} into the git notes of " +
                "$repository. The plugin did not move the old folder, so the folder stays at " +
                "${folder.resolve(FolderStore.FOLDER)}.",
            warning = true,
            refresh = true,
        )
        else -> MigrationNotice(
            "The plugin moved ${commentCount(report.moved)} into the git notes of $repository. " +
                "The old folder now sits at $movedTo.",
            warning = false,
            refresh = true,
        )
    }

    private fun commentCount(value: Int): String = "$value review comment${if (value == 1) "" else "s"}"

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
