package com.yeskiy.yreview.session

import java.nio.file.Path

/** The three families of operating system that the plugin runs on. */
enum class Platform { WINDOWS, MAC, LINUX }

/**
 * The environment values that the folder list needs.
 *
 * The caller reads them, so every function of [AgentFolders] stays pure and a test drives
 * every platform on any machine.
 */
data class Places(
    val home: String?,
    val appData: String?,
    val localAppData: String?,
    val programData: String?,
    val dataHome: String?,
)

/**
 * The folders that hold a command line agent besides the PATH.
 *
 * An IDE that starts from a desktop launcher inherits a login environment. Its PATH is
 * then shorter than the PATH of a terminal. These folders cover the installers that a
 * developer really uses, so the scan finds an agent that the PATH hides.
 *
 * A folder that no variable names drops out of the list, so no broken path reaches the
 * file system. A variable that carries an empty value names no folder either. An empty
 * first part would give a relative path. The scan would then read a folder under the
 * working directory of the IDE.
 */
object AgentFolders {

    fun platformOf(osName: String): Platform {
        val name = osName.lowercase()
        return when {
            name.startsWith("windows") -> Platform.WINDOWS
            name.startsWith("mac") || name.startsWith("darwin") -> Platform.MAC
            else -> Platform.LINUX
        }
    }

    fun places(): Places = Places(
        home = System.getProperty("user.home"),
        appData = System.getenv("APPDATA"),
        localAppData = System.getenv("LOCALAPPDATA"),
        programData = System.getenv("ProgramData"),
        dataHome = System.getenv("XDG_DATA_HOME"),
    )

    fun of(platform: Platform, places: Places): List<Path> = when (platform) {
        Platform.WINDOWS -> windows(places)
        Platform.MAC -> mac(places)
        Platform.LINUX -> linux(places)
    }.distinct()

    private fun windows(places: Places): List<Path> = listOfNotNull(
        // The official Claude Code installer.
        path(places.home, ".local", "bin"),
        // The npm global prefix. A binary lands in the prefix itself, not in a bin folder.
        path(places.appData, "npm"),
        // Volta shims. This folder holds codex.cmd, gemini.cmd, and opencode.cmd.
        path(places.localAppData, "Volta", "bin"),
        // Scoop shims, for one user and for the whole machine.
        path(places.home, "scoop", "shims"),
        path(places.programData, "scoop", "shims"),
        // Chocolatey shims.
        path(places.programData, "chocolatey", "bin"),
        // The pnpm global folder and the bun global folder.
        path(places.localAppData, "pnpm"),
        path(places.home, ".bun", "bin"),
        // The Antigravity command line installer.
        path(places.localAppData, "agy", "bin"),
    )

    private fun mac(places: Places): List<Path> = listOfNotNull(
        Path.of("/opt/homebrew/bin"),
        Path.of("/usr/local/bin"),
        path(places.home, ".local", "bin"),
        path(places.home, ".npm-global", "bin"),
        path(places.home, ".volta", "bin"),
        path(places.home, "Library", "pnpm"),
        path(places.home, ".bun", "bin"),
    )

    private fun linux(places: Places): List<Path> = listOfNotNull(
        path(places.home, ".local", "bin"),
        Path.of("/usr/local/bin"),
        path(places.home, ".npm-global", "bin"),
        Path.of("/home/linuxbrew/.linuxbrew/bin"),
        path(places.home, ".volta", "bin"),
        places.dataHome?.let { path(it, "pnpm") } ?: path(places.home, ".local", "share", "pnpm"),
        path(places.home, ".bun", "bin"),
        Path.of("/snap/bin"),
        Path.of("/var/lib/flatpak/exports/bin"),
        path(places.home, ".local", "share", "flatpak", "exports", "bin"),
    )

    /** Null when the first part names no folder, and null when no path carries the parts. */
    private fun path(first: String?, vararg more: String): Path? =
        first?.takeIf { it.isNotBlank() }?.let { runCatching { Path.of(it, *more) }.getOrNull() }
}
