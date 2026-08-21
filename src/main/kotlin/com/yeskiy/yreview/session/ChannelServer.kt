package com.yeskiy.yreview.session

import java.nio.file.Files
import java.nio.file.Path

/**
 * Reads the channel server setting.
 *
 * The plugin cannot find this file on its own. The channel server is a Node program of the
 * y-review checkout, and the plugin ships no copy of it. For this reason the user names the
 * path, and an empty setting is the honest state of a fresh installation.
 */
object ChannelServer {

    /** What the setting names right now. */
    sealed interface Answer {

        /** The settings hold no channel server. The session then runs without the channel. */
        data object NotSet : Answer

        /** The settings name a path, and that path is not a file. */
        data class Missing(val path: String) : Answer

        data class Found(val path: String) : Answer
    }

    /** The last part of the path, as the build of the channel writes it. */
    const val FILE_NAME = "main.js"

    /** The last part of the path, for the help text of the settings page. */
    const val PATH_SHAPE = "channel/dist/$FILE_NAME"

    fun locate(setting: String, exists: (Path) -> Boolean = { Files.isRegularFile(it) }): Answer {
        val trimmed = setting.trim()
        if (trimmed.isEmpty()) return Answer.NotSet
        val path = runCatching { Path.of(trimmed) }.getOrNull() ?: return Answer.Missing(trimmed)
        return if (exists(path)) Answer.Found(path.toString()) else Answer.Missing(trimmed)
    }

    /** The text the settings page shows under a path that is not a file, or null while it is good. */
    fun problem(setting: String, exists: (Path) -> Boolean = { Files.isRegularFile(it) }): String? =
        when (val answer = locate(setting, exists)) {
            is Answer.Missing -> "This path is not a file: ${answer.path}"
            Answer.NotSet, is Answer.Found -> null
        }
}
