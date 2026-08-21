package com.yeskiy.yreview.session

import java.nio.file.Path

/** What one search for a Node installation found. */
data class NodeInstall(val path: String?) {

    val found: Boolean get() = path != null

    companion object {
        val NOTHING = NodeInstall(null)
    }
}

/**
 * Looks for a Node installation on this machine.
 *
 * The channel server is one JavaScript file, and Node runs it. The PATH comes first,
 * because every installer of Node writes the launcher there. Three well known folders
 * follow, because the IDE can hold a PATH that the shell of the user does not have.
 *
 * The search reports a file, and the session runs that file. A full path beats the bare
 * command here, because Claude Code starts the server with a PATH of its own.
 */
object NodeSearch {

    const val COMMAND = "node"

    /** The names a folder can hold. Windows adds an extension to the command. */
    val FILE_NAMES = listOf("node", "node.exe")

    /** The folder of a POSIX installer, then the folder of Homebrew on Apple silicon. */
    val POSIX_FOLDERS = listOf("/usr/local/bin", "/opt/homebrew/bin")

    /** The folder of the Windows installer comes first, because it follows the machine. */
    fun folders(programFiles: String?): List<Path> =
        listOfNotNull(programFiles?.let { Path.of(it, "nodejs") }) + POSIX_FOLDERS.map { Path.of(it) }

    fun candidates(programFiles: String?): List<Path> =
        folders(programFiles).flatMap { folder -> FILE_NAMES.map { folder.resolve(it) } }

    /** The first answer wins. The PATH beats a folder, and a folder beats nothing. */
    fun of(onPath: String?, files: List<Path>, exists: (Path) -> Boolean): NodeInstall =
        onPath?.let { NodeInstall(it) }
            ?: files.firstOrNull(exists)?.let { NodeInstall(it.toString()) }
            ?: NodeInstall.NOTHING
}
