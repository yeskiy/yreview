package com.yeskiy.yreview.session

/**
 * Wraps the command line of a review session in a shell.
 *
 * A shell runs the command, so the profile of the user loads and a command that is a
 * shell function still resolves. The shell carries no flag that keeps it alive, therefore
 * it exits with the agent and the tool window reports the true state.
 *
 * The session reads the project from the working directory, which is why [windowsPath]
 * still matters. The IDE server refuses a WSL path.
 *
 * Nothing here knows any agent. [AgentLaunch] builds the argument list.
 */
object ShellCommand {

    /** The shell of a machine that is not Windows, when the environment names none. */
    const val FALLBACK_SHELL = "/bin/sh"

    private val WSL_PATH = Regex("^/mnt/([a-zA-Z])(/.*)?$")

    /** The form the IDE server accepts. A WSL path is refused there, so it is converted. */
    fun windowsPath(raw: String): String {
        val slashes = raw.replace('\\', '/')
        val windows = WSL_PATH.matchEntire(slashes)
            ?.let { it.groupValues[1].uppercase() + ":" + it.groupValues[2].ifEmpty { "/" } }
            ?: slashes
        return if (windows.length > 3 && windows.endsWith("/")) windows.dropLast(1) else windows
    }

    /**
     * One line for the shell. Every part is a literal string, so a path with a space and
     * a flag that starts with two hyphens both reach the agent unchanged.
     */
    fun shellLine(parts: List<String>, windows: Boolean = onWindows()): String =
        if (windows) {
            parts.joinToString(" ", prefix = "& ") { powerShellQuote(it) }
        } else {
            parts.joinToString(" ") { posixQuote(it) }
        }

    /**
     * The wrapper of the session. Windows runs PowerShell without the -NoProfile flag, so
     * the profile of the user loads. Any other system runs a login shell for the same
     * reason. Neither wrapper carries a flag that keeps it alive after the agent exits.
     */
    fun shellCommand(
        parts: List<String>,
        windows: Boolean = onWindows(),
        shell: String = loginShell(),
    ): List<String> =
        if (windows) {
            listOf("powershell.exe", "-NoLogo", "-Command", shellLine(parts, windows = true))
        } else {
            listOf(shell, "-l", "-c", shellLine(parts, windows = false))
        }

    fun onWindows(): Boolean =
        System.getProperty("os.name").orEmpty().lowercase().startsWith("windows")

    fun loginShell(): String = System.getenv("SHELL")?.takeIf { it.isNotBlank() } ?: FALLBACK_SHELL

    /** PowerShell ends a literal string at a single quote, and two of them stand for one. */
    private fun powerShellQuote(value: String): String = "'" + value.replace("'", "''") + "'"

    /** A literal string of a POSIX shell holds no escape, so the string closes and opens again. */
    private fun posixQuote(value: String): String = "'" + value.replace("'", "'\\''") + "'"
}
