package com.yeskiy.yreview.diagnostic

import com.yeskiy.yreview.session.ShellCommand

/**
 * Takes the machine of the user out of a diagnostic text.
 *
 * A report goes to a public issue tracker. It must name no user, no folder layout, no
 * remote and no secret. The project path goes first, because a project can sit inside the
 * home folder, and the longer match then wins.
 *
 * The rules run over plain text, so one call cleans a whole report, whatever field the
 * text came from. Every route that shows a record calls this object last.
 *
 * The log of the IDE reaches a maintainer as well, and the message of an exception holds
 * the path that the work failed on. [failure] therefore cleans a throwable before a log
 * line carries it.
 */
object Redact {

    const val HOME_MARK = "~"

    const val PROJECT_MARK = "<project>"

    const val REMOTE_MARK = "<remote>"

    const val EMAIL_MARK = "<email>"

    const val SECRET_MARK = "<secret>"

    /** The longest chain of causes a clean copy keeps. A ring of causes ends here. */
    const val CAUSES = 10

    /** The names of the loopback interface. A report keeps an address of this machine. */
    private val LOOPBACK = setOf("localhost", "::1", "[::1]")

    /** The scp form of a git remote, for example git@example.com:owner/repo.git */
    private val SCP_REMOTE = Regex("""[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s"']+""")

    private val URL = Regex("""[A-Za-z][A-Za-z0-9+.-]*://[^\s"'<>]+""")

    private val EMAIL = Regex("""[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}""")

    /** The bridge token is 64 hexadecimal characters. A shorter run of hex also goes out. */
    private val HEX_RUN = Regex("""(?<![0-9A-Za-z])[0-9a-fA-F]{16,}(?![0-9A-Za-z])""")

    /** A value that follows the word token, whatever the alphabet of the value is. */
    private val TOKEN_VALUE = Regex("""(?i)(token["'\s:=]{1,4})([A-Za-z0-9._+/-]{8,})""")

    /**
     * The home folder of the user, under both names the platform uses.
     *
     * [com.yeskiy.yreview.session.BridgeDiscovery] reads USERPROFILE first and user.home
     * second, so a path can carry either form. Both go out of the text.
     */
    fun homes(): List<String> =
        listOfNotNull(System.getenv("USERPROFILE"), System.getProperty("user.home")).filter { it.isNotBlank() }

    fun text(value: String, home: String, projectPath: String?): String = text(value, listOf(home), projectPath)

    /** Both slash forms reach this function, and Windows compares a path without case. */
    fun text(value: String, homes: List<String>, projectPath: String?): String {
        val withProject = projectPaths(projectPath).fold(value.replace('\\', '/')) { text, path ->
            replace(text, path, PROJECT_MARK)
        }
        val withHome = homes.fold(withProject) { text, home ->
            replace(text, home.replace('\\', '/'), HOME_MARK)
        }
        return secrets(addresses(withHome))
    }

    /**
     * Every spelling one project folder has in a report.
     *
     * The IDE inside WSL answers a base path such as /mnt/e/work/demo-repo. A session plan
     * writes the same folder as E:/work/demo-repo, because the IDE server refuses a WSL
     * path. A record therefore holds a spelling that the base path does not match, and both
     * spellings name the folder of the user. A path that is already a Windows path or a
     * plain POSIX path keeps one spelling.
     */
    private fun projectPaths(projectPath: String?): List<String> =
        projectPath?.let { listOf(it.replace('\\', '/'), ShellCommand.windowsPath(it)).distinct() }.orEmpty()

    /**
     * The same failure, with the same reason, and without the path it failed on.
     *
     * A log line prints the message of the throwable, so a clean text beside it is not
     * enough. The copy carries the name of the original class, the clean message, the
     * stack trace and the clean cause. A stack trace names classes and no path, so the
     * copy keeps it whole and the reader still sees where the work stopped.
     */
    fun failure(value: Throwable, homes: List<String>, projectPath: String?): Throwable =
        failure(value, homes, projectPath, CAUSES)

    private fun failure(value: Throwable, homes: List<String>, projectPath: String?, left: Int): Throwable =
        Clean(
            value.javaClass.name,
            value.message?.let { text(it, homes, projectPath) },
            value.cause?.takeIf { left > 0 }?.let { failure(it, homes, projectPath, left - 1) },
        ).also { it.stackTrace = value.stackTrace }

    /**
     * A copy of one failure. It answers the name of the original, so a log line still says
     * what went wrong, and a chain of causes that points back at itself still ends.
     */
    private class Clean(private val name: String, message: String?, cause: Throwable?) :
        Throwable(message, cause) {

        override fun toString(): String = message?.let { "$name: $it" } ?: name
    }

    /**
     * Takes out every address that names another machine or another person.
     *
     * The scp form of a remote runs first, because it holds an at sign and a colon, and
     * the rule for an electronic mail address would take half of it.
     */
    private fun addresses(value: String): String =
        value.replace(SCP_REMOTE, REMOTE_MARK)
            .replace(URL) { if (loopback(it.value)) it.value else REMOTE_MARK }
            .replace(EMAIL, EMAIL_MARK)

    private fun secrets(value: String): String =
        value.replace(TOKEN_VALUE) { it.groupValues[1] + SECRET_MARK }.replace(HEX_RUN, SECRET_MARK)

    /** The host of one address, without the user information and without the port. */
    private fun loopback(url: String): Boolean {
        val host = url.substringAfter("://")
            .substringBefore('/')
            .substringBefore('?')
            .substringAfterLast('@')
            .substringBeforeLast(':')
            .lowercase()
        return host in LOOPBACK || host.startsWith("127.")
    }

    /**
     * Replaces every occurrence, whatever the case.
     *
     * The search compares character by character over the original text. A search over a
     * lower case copy would move the offsets, because one letter can grow when it changes
     * case, and the report would then keep a part of the path.
     */
    private fun replace(value: String, needle: String, mark: String): String {
        val target = needle.trimEnd('/')
        if (target.isEmpty()) return value
        val built = StringBuilder()
        var index = 0
        while (index < value.length) {
            val hit = value.indexOf(target, index, ignoreCase = true)
            if (hit < 0) {
                built.append(value, index, value.length)
                break
            }
            built.append(value, index, hit).append(mark)
            index = hit + target.length
        }
        return built.toString()
    }
}
