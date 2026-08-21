package com.yeskiy.yreview.session

/**
 * Builds the command line of a review session.
 *
 * The session runs the `claude` launcher and nothing else. The launcher owns the flags,
 * and it is the only place that may own them. Two `--mcp-config` entries that name one
 * server do not merge: the last flag replaces the whole entry, headers included. The
 * launcher also drops the channel when no bridge is running, and a second channel flag
 * from here would put the failing server back.
 *
 * The launcher reads the project from the working directory, which is why [windowsPath]
 * still matters. The IDE server refuses a WSL path.
 */
object ClaudeCommand {

    const val LAUNCHER = "claude"

    private val WSL_PATH = Regex("^/mnt/([a-zA-Z])(/.*)?$")

    /** The form the IDE server accepts. A WSL path is refused there, so it is converted. */
    fun windowsPath(raw: String): String {
        val slashes = raw.replace('\\', '/')
        val windows = WSL_PATH.matchEntire(slashes)
            ?.let { it.groupValues[1].uppercase() + ":" + it.groupValues[2].ifEmpty { "/" } }
            ?: slashes
        return if (windows.length > 3 && windows.endsWith("/")) windows.dropLast(1) else windows
    }

    fun arguments(): List<String> = listOf(LAUNCHER)

    /** The launcher is a PowerShell function, so the session runs as one PowerShell line. */
    fun shellLine(): String = arguments().joinToString(" ")

    /**
     * PowerShell exits as soon as the launcher exits. The terminal session then ends with
     * the agent, and the tool window reports the true state.
     */
    fun shellCommand(): List<String> =
        listOf("powershell.exe", "-NoLogo", "-Command", shellLine())
}
