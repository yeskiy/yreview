package com.yeskiy.yreview.session

/**
 * One variable that the shell reads from a file, and sets for the agent.
 *
 * The value stays out of this object. The plugin wrote it to [path], and the shell line
 * names that path alone.
 */
data class SecretVariable(val name: String, val path: String)

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

    /** What the shell prints before it stops a session that has no secret to hand on. */
    const val NO_SECRET = "The plugin wrote no secret for this session, so the session stops."

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
     *
     * [secret] adds the read of one value in front of the command. The line names the file
     * and never the value.
     */
    fun shellLine(
        parts: List<String>,
        secret: SecretVariable? = null,
        windows: Boolean = onWindows(),
    ): String =
        if (windows) {
            secretPrefix(secret, windows = true) + parts.joinToString(" ", prefix = "& ") { powerShellQuote(it) }
        } else {
            secretPrefix(secret, windows = false) + parts.joinToString(" ") { posixQuote(it) }
        }

    /**
     * The text that puts the value of the file into the variable of the agent.
     *
     * PowerShell holds no assignment prefix, so it sets the variable of its own process and
     * the agent inherits it. A POSIX shell takes an assignment before a command, and the
     * value then reaches that command alone. Both forms name the file with the quoting rule
     * of their own shell, and PowerShell reads a literal path, so a bracket in the path
     * stays a bracket and never becomes a pattern.
     *
     * Both forms remove the file after the read. The value therefore stands on disk for the
     * length of one read, and a stop of the IDE leaves no value behind.
     *
     * A read that gives nothing stops the line, and the agent never starts. An agent that
     * takes an empty value can drop the guard that the value stands for. OpenCode does
     * that, and it then answers every unauthenticated request of this machine.
     */
    private fun secretPrefix(secret: SecretVariable?, windows: Boolean): String {
        secret ?: return ""
        return if (windows) {
            "\$env:${secret.name} = (Get-Content -LiteralPath ${powerShellQuote(secret.path)}); " +
                "Remove-Item -LiteralPath ${powerShellQuote(secret.path)} -Force; " +
                "if ([string]::IsNullOrEmpty(\$env:${secret.name})) " +
                "{ Write-Error ${powerShellQuote(NO_SECRET)}; exit 1 }; "
        } else {
            "${secret.name}=\"\$(cat ${posixQuote(secret.path)} && rm -f ${posixQuote(secret.path)})\"; " +
                "if [ -z \"\$${secret.name}\" ]; " +
                "then echo ${posixQuote(NO_SECRET)} >&2; exit 1; fi; " +
                "export ${secret.name}; "
        }
    }

    /**
     * The wrapper of the session. Windows runs PowerShell without the -NoProfile flag, so
     * the profile of the user loads. Any other system runs a login shell for the same
     * reason. Neither wrapper carries a flag that keeps it alive after the agent exits.
     */
    fun shellCommand(
        parts: List<String>,
        secret: SecretVariable? = null,
        windows: Boolean = onWindows(),
        shell: String = loginShell(),
    ): List<String> =
        if (windows) {
            listOf("powershell.exe", "-NoLogo", "-Command", shellLine(parts, secret, windows = true))
        } else {
            listOf(shell, "-l", "-c", shellLine(parts, secret, windows = false))
        }

    fun onWindows(): Boolean =
        System.getProperty("os.name").orEmpty().lowercase().startsWith("windows")

    fun loginShell(): String = System.getenv("SHELL")?.takeIf { it.isNotBlank() } ?: FALLBACK_SHELL

    /** PowerShell ends a literal string at a single quote, and two of them stand for one. */
    private fun powerShellQuote(value: String): String = "'" + value.replace("'", "''") + "'"

    /** A literal string of a POSIX shell holds no escape, so the string closes and opens again. */
    private fun posixQuote(value: String): String = "'" + value.replace("'", "'\\''") + "'"
}
