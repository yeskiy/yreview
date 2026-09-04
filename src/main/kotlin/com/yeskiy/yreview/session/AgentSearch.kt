package com.yeskiy.yreview.session

import java.io.File
import java.nio.file.Path

/** Where the search found the launcher of an agent. */
enum class AgentSource { PATH, FOLDER, NONE }

/** What one search for one agent found. */
data class AgentInstall(val path: String?, val source: AgentSource) {

    val found: Boolean get() = path != null

    companion object {
        val NOTHING = AgentInstall(null, AgentSource.NONE)
    }
}

/**
 * Looks for one agent, and then for every agent.
 *
 * The PATH comes first, because most installers write a launcher there. The well known
 * folders follow, because an IDE that starts from a desktop launcher can hold a shorter
 * PATH than the terminal of the same user.
 *
 * Every function is pure. The caller passes the environment as text, the folder list, and
 * the two file tests, so one test drives every platform on any machine.
 *
 * A search reports a file. A user whose command is a shell function keeps that function,
 * because a shell function has no file and no PATH entry, and no search finds it. For that
 * reason no message of this plugin ever says that an agent is not installed.
 */
object AgentSearch {

    fun one(
        spec: AgentSpec,
        path: String?,
        pathExt: String?,
        windows: Boolean,
        folders: List<Path>,
        runnable: (Path) -> Boolean,
        exists: (Path) -> Boolean,
    ): AgentInstall {
        if (spec.commands.isEmpty()) return AgentInstall.NOTHING
        val onPath = spec.commands.firstNotNullOfOrNull { command ->
            PathLookup.find(command, path, File.pathSeparatorChar, windows, pathExt, runnable)
        }
        if (onPath != null) return AgentInstall(onPath.toAbsolutePath().toString(), AgentSource.PATH)
        val file = candidates(spec, windows, pathExt, folders).firstOrNull(exists)
        return file?.let { AgentInstall(it.toString(), AgentSource.FOLDER) } ?: AgentInstall.NOTHING
    }

    fun all(
        specs: List<AgentSpec>,
        path: String?,
        pathExt: String?,
        windows: Boolean,
        folders: List<Path>,
        runnable: (Path) -> Boolean,
        exists: (Path) -> Boolean,
    ): Map<AgentId, AgentInstall> =
        specs.associate { it.id to one(it, path, pathExt, windows, folders, runnable, exists) }

    /**
     * Every file that one folder can hold for one agent. [PathLookup.names] builds the
     * Windows names from PATHEXT, so a Scoop shim and a Volta shim both appear here.
     */
    private fun candidates(
        spec: AgentSpec,
        windows: Boolean,
        pathExt: String?,
        folders: List<Path>,
    ): List<Path> = folders.flatMap { folder ->
        spec.commands.flatMap { command ->
            PathLookup.names(command, windows, pathExt).mapNotNull { name ->
                runCatching { folder.resolve(name) }.getOrNull()
            }
        }
    }
}
