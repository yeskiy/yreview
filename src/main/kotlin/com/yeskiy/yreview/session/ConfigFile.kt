package com.yeskiy.yreview.session

import com.yeskiy.yreview.store.FolderStore
import java.nio.file.Path

/**
 * Where the Model Context Protocol configuration file of one agent stands, and when the
 * plugin must write it.
 *
 * The path outlives the review session. An agent keeps the path it started with, and it
 * starts a later job of that session with the same path. A path that goes away with the
 * session makes that later start fail.
 *
 * One agent gets one file, because the document of OpenCode differs from the document of
 * every other agent. The file stands beside the bridge folder, under the plugin root of
 * the user home.
 */
object ConfigFile {

    /** The folder that holds one file for each agent. */
    const val FOLDER = "mcp"

    const val SUFFIX = ".json"

    fun fileName(id: AgentId): String = id.name.lowercase() + SUFFIX

    fun path(home: Path, id: AgentId): Path =
        home.resolve(FolderStore.FOLDER).resolve(FOLDER).resolve(fileName(id))

    /**
     * True while the file on disk differs from the text that the session needs. [onDisk]
     * is null when no file stands there.
     *
     * The plugin compares the content, and never the name of the file. An IDE upgrade
     * moves the Java launcher and the jar of the plugin, so a file that stands there can
     * still name the wrong paths.
     */
    fun needsWrite(onDisk: String?, wanted: String): Boolean = onDisk != wanted
}
