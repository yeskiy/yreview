package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.StoreKind
import java.nio.file.Path
import java.security.MessageDigest

/**
 * The folder that holds the three files of the file protocol, for one store.
 *
 * A git repository keeps them inside the git directory, which git never tracks, so no
 * review file reaches a commit. A folder store keeps them beside its own records, in the
 * same folder, because no git directory exists there.
 *
 * One project window owns one folder inside that place. A user can open two windows on one
 * repository, for example the root in one window and a subfolder in the other. Both windows
 * send the tasks of that repository, and a shared folder would let the second send replace
 * the task file of the first one.
 *
 * The rule takes plain paths, so a test proves it without a project.
 */
object HandoffPlace {

    /** The sentence that tells a user where the files of one send stand. */
    val FILES_TEXT: String =
        "Every send writes ${AgentGuide.FILE_NAME} and ${HandoffFiles.TASKS_NAME} in the review folder " +
            "of this project window. A git repository keeps that folder inside its git directory, " +
            "and a folder that no repository holds keeps it in ${FolderStore.FOLDER}."

    /** The name keeps this many characters of the project folder for a person to read. */
    private const val READABLE_LENGTH = 24

    /** Four bytes of the hash give eight hexadecimal characters. */
    private const val HASH_BYTES = 4

    /** The name of the folder of a project that names no directory. */
    private const val NO_PATH = "project"

    private val NOT_ALPHANUMERIC = Regex("[^A-Za-z0-9]")

    /**
     * The folder of one project window.
     *
     * [gitDir] is the answer of [GitDir.of], and it is null when git did not answer.
     * [projectPath] is the directory of the project window, and it is empty when the
     * project names no directory.
     */
    fun of(kind: StoreKind, root: Path, gitDir: Path?, projectPath: String): Path? =
        shared(kind, root, gitDir)?.resolve(window(projectPath))

    /**
     * The review folder that every window of one store shares.
     *
     * A build before this release wrote the three files straight into this folder. The done
     * file of that build still stands here, and the plugin still reads it, so an agent that
     * reports a finished task in the older file still closes that task.
     */
    fun shared(kind: StoreKind, root: Path, gitDir: Path?): Path? = when (kind) {
        StoreKind.GIT -> gitDir?.resolve(GitDir.FOLDER)
        StoreKind.FOLDER -> root.resolve(FolderStore.FOLDER)
    }

    /**
     * The name of the folder that one project window owns.
     *
     * The name of the project folder stays readable, because a person opens the folder by
     * that name. The hash reads the whole path, so two windows of one repository never meet
     * in one folder.
     */
    private fun window(projectPath: String): String {
        val readable = NOT_ALPHANUMERIC.replace(projectPath.split('/', '\\').last(), "-")
        return readable.takeLast(READABLE_LENGTH).ifEmpty { NO_PATH } + "-" + hashOf(projectPath)
    }

    private fun hashOf(path: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(path.toByteArray(Charsets.UTF_8))
            .take(HASH_BYTES)
            .joinToString("") { "%02x".format(it) }
}
