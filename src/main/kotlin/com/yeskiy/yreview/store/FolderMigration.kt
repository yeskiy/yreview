package com.yeskiy.yreview.store

import java.nio.file.Path

/** How many record lines the migration moved, and the reason it stopped when it did. */
data class MigrationReport(val moved: Int, val problem: String?)

/** The lines of one store after the rewrite, and the new identifier of each old one. */
data class Rewrite(val lines: List<String>, val renames: Map<String, String>)

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

    /** The path of the folder under the repository: "" for the same folder, null for a folder outside it. */
    fun prefixOf(repositoryRoot: String, folderRoot: String): String? = when {
        folderRoot == repositoryRoot -> ""
        AnchorRules.holds(repositoryRoot, folderRoot) -> AnchorRules.relative(folderRoot, repositoryRoot)
        else -> null
    }

    /** True when this repository holds the folder, so its records can move with a path prefix. */
    fun maySettle(repositoryRoot: String, folderRoot: String): Boolean = prefixOf(repositoryRoot, folderRoot) != null

    /**
     * True when one lookup that may write can move the store. The move does not rewrite paths
     * yet, so only a repository rooted at the folder itself takes the records.
     */
    fun mayMove(writes: Boolean, repositoryRoot: String, folderRoot: String): Boolean =
        writes && prefixOf(repositoryRoot, folderRoot) == ""

    /** New identifiers for every record of one store. A parent gets its new identifier before its child. */
    fun rewrite(lines: List<String>, prefix: String): Rewrite {
        if (prefix.isEmpty()) return Rewrite(lines, emptyMap())
        val byId = lines.mapNotNull { line -> decoded(line)?.let { it.id() to it } }.toMap()
        val renames = mutableMapOf<String, String>()
        fun newId(old: String): String = renames[old] ?: moved(byId.getValue(old), prefix) { link ->
            if (link in byId) newId(link) else link
        }.id().also { renames[old] = it }
        byId.keys.forEach { newId(it) }
        return Rewrite(lines.map { rewriteLine(it, prefix, renames) }, renames.toMap())
    }

    /** One line with the path prefix and the new links. A line that does not decode stays as it is. */
    fun rewriteLine(line: String, prefix: String, renames: Map<String, String>): String {
        if (prefix.isEmpty()) return line
        val record = decoded(line) ?: return line
        return CommentJson.encode(moved(record, prefix) { renames[it] ?: it })
    }

    private fun moved(record: Comment, prefix: String, link: (String) -> String): Comment = record.copy(
        parent = record.parent?.let(link),
        original = record.original?.let(link),
        location = record.location?.let { it.copy(path = "$prefix/${it.path}") },
    )

    private fun decoded(line: String): Comment? = runCatching { CommentJson.decode(line) }.getOrNull()

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

    /**
     * Copies every record, and stops at the first read the plugin cannot trust.
     *
     * Every read here feeds a write, so each one goes through the door that refuses. A read
     * that answered an empty list because it failed would let the copy report success, and
     * the caller would then move a folder whose records never reached the notes.
     */
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
        try {
            from.commitsOrRefuse(ref).fold(report) { carried, key ->
                if (carried.problem != null) carried else copyKey(from, to, ref, key, target, carried)
            }
        } catch (refused: NotesWriteException) {
            MigrationReport(report.moved, refused.message.orEmpty())
        }

    private fun copyKey(
        from: NoteStore,
        to: NoteStore,
        ref: String,
        key: String,
        target: String,
        report: MigrationReport,
    ): MigrationReport =
        try {
            moveKey(from, to, ref, key, target, report)
        } catch (refused: NotesWriteException) {
            MigrationReport(report.moved, refused.message.orEmpty())
        }

    private fun moveKey(
        from: NoteStore,
        to: NoteStore,
        ref: String,
        key: String,
        target: String,
        report: MigrationReport,
    ): MigrationReport {
        val source = from.readOrRefuse(ref, key)
        if (source.isEmpty()) return report
        val known: Set<String?> = idsOf(to.readOrRefuse(ref, target))
        val missing = source.filter { idOf(it) !in known }
        missing.forEach { to.append(ref, target, it) }
        val after = idsOf(to.readOrRefuse(ref, target))
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

/** A read-only view of [from] where each line has the path prefix and the new links. */
class RewrittenNotes(
    private val from: NoteStore,
    private val prefix: String,
    private val renames: Map<String, String>,
) : NoteStore {

    override fun readLines(ref: String, commit: String): List<String> = from.readLines(ref, commit).map(::moved)

    override fun readOrRefuse(ref: String, commit: String): List<String> = from.readOrRefuse(ref, commit).map(::moved)

    override fun append(ref: String, commit: String, line: String) = refuse()

    override fun rewrite(ref: String, commit: String, lines: List<String>) = refuse()

    override fun commitsWithNotes(ref: String): List<String> = from.commitsWithNotes(ref)

    override fun commitsOrRefuse(ref: String): List<String> = from.commitsOrRefuse(ref)

    private fun moved(line: String): String = FolderMigration.rewriteLine(line, prefix, renames)

    private fun refuse(): Nothing = throw NotesWriteException("A rewritten store takes no write.")
}
