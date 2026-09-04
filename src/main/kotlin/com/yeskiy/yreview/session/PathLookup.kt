package com.yeskiy.yreview.session

import java.nio.file.Path

/**
 * Finds a command in the folders of the PATH variable.
 *
 * The platform helper for this search leaves the 2026.3 release, and the member that
 * replaces it is absent from the 2026.2 compile target. This object therefore reads the two
 * environment variables on its own, so one build runs on both releases.
 *
 * Every function is pure. The caller passes the environment as text, and the caller passes
 * the test of a runnable file, so a test drives the whole search on any machine.
 */
object PathLookup {

    /** The extensions Windows runs when PATHEXT holds nothing. */
    val DEFAULT_EXTENSIONS = listOf(".COM", ".EXE", ".BAT", ".CMD")

    /** PATHEXT divides its entries with a semicolon on every Windows release. */
    private const val EXTENSION_SEPARATOR = ';'

    /**
     * The folders of one PATH value, in order. An empty entry stands for the working folder
     * of the process, and this search drops it.
     */
    fun entries(path: String?, separator: Char): List<String> =
        path.orEmpty().split(separator).map(String::trim).filter(String::isNotEmpty)

    /** The extensions of one PATHEXT value. A value that names none falls back to the defaults. */
    fun extensions(pathExt: String?): List<String> =
        pathExt.orEmpty().split(EXTENSION_SEPARATOR)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .map { if (it.startsWith(".")) it else ".$it" }
            .ifEmpty { DEFAULT_EXTENSIONS }

    /**
     * The file names one command can carry. A system that is not Windows runs the bare name.
     * Windows starts a file through its extension, so the bare name stays out of that list.
     */
    fun names(command: String, windows: Boolean, pathExt: String?): List<String> =
        if (windows) extensions(pathExt).map { command + it } else listOf(command)

    /**
     * The first file that answers, or null when no folder holds the command. The folders keep
     * the order of the PATH, and the names keep the order of PATHEXT, so the answer names the
     * file that a shell of the same machine starts.
     */
    fun find(
        command: String,
        path: String?,
        separator: Char,
        windows: Boolean,
        pathExt: String?,
        runnable: (Path) -> Boolean,
    ): Path? {
        val names = names(command, windows, pathExt)
        return entries(path, separator).firstNotNullOfOrNull { folder ->
            names.mapNotNull { resolve(folder, it) }.firstOrNull(runnable)
        }
    }

    /** A PATH can hold an entry that no path can carry. Such an entry drops out of the search. */
    private fun resolve(folder: String, name: String): Path? =
        runCatching { Path.of(folder, name) }.getOrNull()
}
