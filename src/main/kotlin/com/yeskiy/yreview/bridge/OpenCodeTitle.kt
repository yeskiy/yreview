package com.yeskiy.yreview.bridge

import com.yeskiy.yreview.ui.PlainText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * One session of an OpenCode server, as the list call answers it.
 *
 * The server answers many more fields than these four. Every field carries a default, so a
 * new release of OpenCode that drops one of them still parses.
 */
@Serializable
data class OpenCodeSession(
    val id: String = "",
    val title: String = "",
    val directory: String = "",
    val time: Time = Time(),
) {

    /** The clock of one session. Only the last change matters here. */
    @Serializable
    data class Time(val updated: Long = 0)
}

/**
 * The name that an OpenCode session gives itself.
 *
 * The store of OpenCode holds the sessions of every directory, and one server answers for
 * the whole store. The list is therefore cut down to the working directory of this tab.
 * The newest of what is left is the session on screen, because a session that reads a
 * message is the session that changed last.
 *
 * The plugin never writes a title. It reads one.
 */
object OpenCodeTitle {

    /** Root sessions only. A subagent of a session is no tab of the window. */
    const val LIST_PATH = "/session?roots=true"

    private val JSON = Json { ignoreUnknownKeys = true }

    /** The drive letter that starts a Windows path, in the spelling of the answer. */
    private val DRIVE = Regex("^[a-z]:")

    /** An answer that no parser accepts holds no session, and it must throw nothing. */
    fun parse(body: String): List<OpenCodeSession> =
        runCatching { JSON.decodeFromString<List<OpenCodeSession>>(body) }.getOrDefault(emptyList())

    /**
     * Null while this directory holds no named session.
     *
     * The title comes from the person who talks to the agent, and it reaches a tab, a
     * tooltip and a notice. It therefore follows the rule of [PlainText], as the title of
     * every other agent does in [com.yeskiy.yreview.session.AgentTitle]. A title that
     * starts with the markup tag names nothing, and a long title ends after the cap.
     */
    fun pick(sessions: List<OpenCodeSession>, directory: String): String? = sessions
        .filter { same(it.directory, directory) }
        .maxByOrNull { it.time.updated }
        ?.title
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.takeUnless { PlainText.isMarkup(it) }
        ?.let { PlainText.of(it) }

    /**
     * One directory, two spellings. The plugin writes a slash, and the server a backslash.
     *
     * The case of the path stays, because a Linux file system holds /home/dev/Project and
     * /home/dev/project as two folders. A drive letter is the one part that a tool spells
     * in either case, so that letter alone reads as one letter.
     */
    fun same(left: String, right: String): Boolean = plain(left) == plain(right)

    private fun plain(path: String): String =
        DRIVE.replace(path.replace('\\', '/').trimEnd('/')) { it.value.uppercase() }
}
