package com.yeskiy.yreview.session

import java.nio.file.Path

/** Where the search found the launcher of Claude Code. */
enum class ClaudeSource { PATH, FOLDER, NONE }

/** What one search for a Claude Code installation found. */
data class ClaudeInstall(val path: String?, val source: ClaudeSource) {

    val found: Boolean get() = path != null

    companion object {
        val NOTHING = ClaudeInstall(null, ClaudeSource.NONE)
    }
}

/**
 * Looks for a Claude Code installation on this machine.
 *
 * The PATH comes first, because every installer of Claude Code writes the launcher there.
 * Two well known folders follow, because the IDE can hold a PATH that the shell of the
 * user does not have.
 *
 * A review session runs the `claude` launcher, which is a PowerShell function of the
 * user profile. A shell function has no file and no PATH entry, so no search finds it. A
 * machine that holds `claude` alone therefore reports nothing.
 */
object ClaudeSearch {

    const val COMMAND = "claude"

    /** The names a folder can hold. Windows adds an extension to the command. */
    val FILE_NAMES = listOf("claude", "claude.exe", "claude.cmd", "claude.bat")

    /** The folder of the official installer, then the folder of a global npm install. */
    fun folders(home: String?, appData: String?): List<Path> = listOfNotNull(
        home?.let { Path.of(it, ".local", "bin") },
        appData?.let { Path.of(it, "npm") },
    )

    fun candidates(home: String?, appData: String?): List<Path> =
        folders(home, appData).flatMap { folder -> FILE_NAMES.map { folder.resolve(it) } }

    /** The first answer wins. The PATH beats a folder, and a folder beats nothing. */
    fun of(onPath: String?, files: List<Path>, exists: (Path) -> Boolean): ClaudeInstall =
        onPath?.let { ClaudeInstall(it, ClaudeSource.PATH) }
            ?: files.firstOrNull(exists)?.let { ClaudeInstall(it.toString(), ClaudeSource.FOLDER) }
            ?: ClaudeInstall.NOTHING
}
