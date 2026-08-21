package com.yeskiy.yreview.session

/**
 * Builds the command line of a review session.
 *
 * The base command comes from the settings, because every machine holds Claude Code in
 * its own place. The plugin owns the two flags a review session needs. One flag declares
 * the channel server, and the other flag registers that server for the session. An entry
 * in a configuration file alone never registers a channel.
 *
 * A shell runs the command, so the profile of the user loads and a command that is a
 * shell function still resolves. The shell carries no flag that keeps it alive, therefore
 * it exits with the agent and the tool window reports the true state.
 *
 * The session reads the project from the working directory, which is why [windowsPath]
 * still matters. The IDE server refuses a WSL path.
 */
object ClaudeCommand {

    /** The default of the official JetBrains plugin as well. Every installer writes it to the PATH. */
    const val DEFAULT_COMMAND = "claude"

    /** The channel event carries the server name, so this name reaches the model. */
    const val SERVER_NAME = "y-review"

    const val CONFIG_FLAG = "--mcp-config"

    /** Channels are a research preview, so a server outside the Anthropic list needs this flag. */
    const val CHANNEL_FLAG = "--dangerously-load-development-channels"

    const val CHANNEL_VALUE = "server:$SERVER_NAME"

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
     * The flags the plugin appends. The settings page shows the same strings, so a user
     * reads what the session really runs.
     */
    fun flags(configFile: String): List<String> =
        listOf(CONFIG_FLAG, configFile, CHANNEL_FLAG, CHANNEL_VALUE)

    /** Without a configuration file the session starts plain, and it carries no channel. */
    fun arguments(command: String, configFile: String? = null): List<String> =
        listOf(command) + configFile?.let { flags(it) }.orEmpty()

    /**
     * One line for the shell. Every part is a literal string, so a path with a space and
     * a flag that starts with two hyphens both reach the agent unchanged.
     */
    fun shellLine(command: String, configFile: String? = null, windows: Boolean = onWindows()): String {
        val parts = arguments(command, configFile)
        return if (windows) {
            parts.joinToString(" ", prefix = "& ") { powerShellQuote(it) }
        } else {
            parts.joinToString(" ") { posixQuote(it) }
        }
    }

    /**
     * The wrapper of the session. Windows runs PowerShell without the -NoProfile flag, so
     * the profile of the user loads. Any other system runs a login shell for the same
     * reason. Neither wrapper carries a flag that keeps it alive after the agent exits.
     */
    fun shellCommand(
        command: String,
        configFile: String? = null,
        windows: Boolean = onWindows(),
        shell: String = loginShell(),
    ): List<String> =
        if (windows) {
            listOf("powershell.exe", "-NoLogo", "-Command", shellLine(command, configFile, windows = true))
        } else {
            listOf(shell, "-l", "-c", shellLine(command, configFile, windows = false))
        }

    fun onWindows(): Boolean =
        System.getProperty("os.name").orEmpty().lowercase().startsWith("windows")

    fun loginShell(): String = System.getenv("SHELL")?.takeIf { it.isNotBlank() } ?: FALLBACK_SHELL

    /** PowerShell ends a literal string at a single quote, and two of them stand for one. */
    private fun powerShellQuote(value: String): String = "'" + value.replace("'", "''") + "'"

    /** A literal string of a POSIX shell holds no escape, so the string closes and opens again. */
    private fun posixQuote(value: String): String = "'" + value.replace("'", "'\\''") + "'"
}
