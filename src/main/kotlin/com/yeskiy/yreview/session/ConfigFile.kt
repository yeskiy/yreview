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
 * One agent of one JetBrains product gets one file, because the document of OpenCode
 * differs from the document of every other agent, and because every product runs the
 * server with a Java launcher and a plugin jar of its own. The file stands beside the
 * bridge folder, under the plugin root of the user home.
 */
object ConfigFile {

    /** The folder that holds one file for each agent. */
    const val FOLDER = "mcp"

    const val SUFFIX = ".json"

    /** The name of a product that names no build code, so every such build shares one file. */
    const val UNKNOWN_PRODUCT = "ide"

    private val NOT_ALPHANUMERIC = Regex("[^A-Za-z0-9]")

    /**
     * [product] is the build code of the running IDE, for example IU or PY. A user who runs
     * two JetBrains products holds one file for each of them, so a live session of the first
     * product never starts a later job with the launcher and the jar of the second one.
     */
    fun fileName(id: AgentId, product: String): String =
        id.name.lowercase() + "-" + code(product) + SUFFIX

    fun path(home: Path, id: AgentId, product: String): Path =
        home.resolve(FolderStore.FOLDER).resolve(FOLDER).resolve(fileName(id, product))

    private fun code(product: String): String =
        NOT_ALPHANUMERIC.replace(product, "-").lowercase().ifEmpty { UNKNOWN_PRODUCT }

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
