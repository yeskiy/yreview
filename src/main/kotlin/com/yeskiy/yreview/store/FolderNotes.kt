package com.yeskiy.yreview.store

import java.io.IOException
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlin.io.path.name

/** The names of the folder store. The bridge uses the same folder name under the user home. */
object FolderStore {

    const val FOLDER = ".y-review"

    const val NOTES = "notes"

    /** The key of a record that no commit holds. It is not hexadecimal, so it is not a commit. */
    const val WORKTREE = "worktree"

    const val SUFFIX = ".jsonl"

    /** A ref name holds a slash, and a file name must not, so the slash becomes a hyphen. */
    fun slug(ref: String): String = ref.replace('/', '-')
}

/**
 * Holds review records in a folder, for a file that no git repository covers.
 *
 * One file holds one key of one ref, and one line holds one record. The lines are the same
 * lines that a git note holds, so a migration copies them without a change.
 */
class FolderNotes(private val root: Path) : NoteStore {

    val folder: Path get() = root.resolve(FolderStore.FOLDER).resolve(FolderStore.NOTES)

    fun fileOf(ref: String, commit: String): Path =
        folder.resolve(FolderStore.slug(ref)).resolve(commit + FolderStore.SUFFIX)

    /**
     * The records of one key, and no record for a file that the plugin cannot read.
     *
     * [NotesGateway] answers the same way when git fails, so both stores keep one contract.
     * A caller that shows records therefore needs no second path.
     */
    override fun readLines(ref: String, commit: String): List<String> =
        try {
            readOrRefuse(ref, commit)
        } catch (refused: NotesWriteException) {
            emptyList()
        }

    /**
     * Appends one record.
     *
     * The append writes the whole file again, so it first reads every record that the file
     * holds. A read that gave nothing because it failed looks the same as an empty file, and
     * a write after such a read replaces every earlier record with the new one. The append
     * therefore reads through [readOrRefuse], which stops the write and names the file.
     */
    override fun append(ref: String, commit: String, line: String) =
        rewrite(ref, commit, readOrRefuse(ref, commit) + line)

    /**
     * The records of one key. A file that the plugin cannot read stops the caller.
     *
     * A file that is not there holds no record, and that is an empty list. The reader reports
     * one byte that no UTF-8 text holds, and it reports a disk that refused the read. Both
     * are a failure, and neither is an empty file.
     */
    private fun readOrRefuse(ref: String, commit: String): List<String> {
        val file = fileOf(ref, commit)
        if (!Files.isRegularFile(file)) return emptyList()
        return try {
            Files.readAllLines(file, StandardCharsets.UTF_8).filter { it.isNotBlank() }
        } catch (failure: IOException) {
            throw NotesWriteException("The plugin did not read $file, so it wrote no record. ${failure.message}")
        }
    }

    override fun rewrite(ref: String, commit: String, lines: List<String>) {
        val file = fileOf(ref, commit)
        if (lines.isEmpty()) {
            remove(file)
            return
        }
        try {
            Files.createDirectories(file.parent)
            replace(file, lines.joinToString("\n", postfix = "\n"))
        } catch (failure: IOException) {
            throw NotesWriteException("The plugin did not write $file. ${failure.message}")
        }
    }

    override fun commitsWithNotes(ref: String): List<String> {
        val directory = folder.resolve(FolderStore.slug(ref))
        if (!Files.isDirectory(directory)) return emptyList()
        return runCatching {
            Files.list(directory).use { stream ->
                stream.map { it.name }
                    .filter { it.endsWith(FolderStore.SUFFIX) }
                    .map { it.removeSuffix(FolderStore.SUFFIX) }
                    .toList()
            }
        }.getOrDefault(emptyList())
    }

    private fun remove(file: Path) {
        try {
            Files.deleteIfExists(file)
        } catch (failure: IOException) {
            throw NotesWriteException("The plugin did not remove $file. ${failure.message}")
        }
    }

    /**
     * The same write that [com.yeskiy.yreview.handoff.HandoffFiles] uses.
     *
     * A reader never sees half a file. The plugin writes with plain file calls and never
     * through the virtual file system, so it needs no write action and no read lock.
     */
    private fun replace(target: Path, text: String) {
        val temporary = Files.createTempFile(target.parent, target.fileName.toString(), ".tmp")
        Files.write(temporary, text.toByteArray(StandardCharsets.UTF_8))
        try {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (unsupported: IOException) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING)
        }
    }
}
