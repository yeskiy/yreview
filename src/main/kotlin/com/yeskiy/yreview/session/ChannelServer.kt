package com.yeskiy.yreview.session

import com.intellij.ide.plugins.cl.PluginAwareClassLoader
import java.nio.file.Files
import java.nio.file.Path

/**
 * Finds the channel server inside the plugin.
 *
 * The plugin ships the server, so no setting names it. The build writes one jar into the
 * folder of the plugin, beside the lib folder, and this search asks the platform where
 * that folder is.
 *
 * The jar holds every class that the server needs. The server runs in a process of its
 * own, and that process reads no class of the IDE.
 */
object ChannelServer {

    /** The identifier of plugin.xml. The platform hands out the plugin folder for it. */
    const val PLUGIN_ID = "com.yeskiy.yreview"

    /** The folder inside the plugin folder that holds the server. */
    const val FOLDER_NAME = "channel"

    /** The file the channel-server build writes. */
    const val FILE_NAME = "y-review-channel.jar"

    /** The class that the Java launcher runs. The jar names it in the manifest as well. */
    const val MAIN_CLASS = "com.yeskiy.yreview.channel.MainKt"

    /** The flag that puts the jar of the server on the class path of the Java launcher. */
    const val CLASS_PATH_FLAG = "-cp"

    /** Where the server is right now. */
    sealed interface Answer {

        /** The platform names no folder for the plugin, so no search can run. */
        data object Unknown : Answer

        /** The folder of the plugin holds no server file. */
        data class Missing(val path: String) : Answer

        data class Found(val path: String) : Answer
    }

    fun file(pluginPath: Path): Path = pluginPath.resolve(FOLDER_NAME).resolve(FILE_NAME)

    fun locate(
        pluginPath: Path? = pluginPath(),
        exists: (Path) -> Boolean = { Files.isRegularFile(it) },
    ): Answer {
        val file = file(pluginPath ?: return Answer.Unknown)
        return if (exists(file)) Answer.Found(file.toString()) else Answer.Missing(file.toString())
    }

    /** Null while no platform answers, so a test outside a running IDE reads no folder. */
    fun pluginPath(): Path? =
        (javaClass.classLoader as? PluginAwareClassLoader)?.pluginDescriptor?.pluginPath
}
