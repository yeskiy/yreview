package com.yeskiy.yreview.session

import java.io.File
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ChannelServerTest {

    private val plugin = Path.of("C:/Users/one/AppData/Roaming/JetBrains/IU2026.2/plugins/y-review")

    private val always: (Path) -> Boolean = { true }

    private val never: (Path) -> Boolean = { false }

    private fun expected(): String = plugin.resolve("channel").resolve("y-review-channel.jar").toString()

    @Test
    fun `the server sits beside the lib folder of the plugin`() {
        assertEquals(ChannelServer.Answer.Found(expected()), ChannelServer.locate(plugin, always))
    }

    @Test
    fun `a plugin folder without the file reports the path it looked at`() {
        assertEquals(ChannelServer.Answer.Missing(expected()), ChannelServer.locate(plugin, never))
    }

    @Test
    fun `no plugin folder reports an unknown place`() {
        assertEquals(ChannelServer.Answer.Unknown, ChannelServer.locate(null, always))
    }

    @Test
    fun `the file name is the jar that the Java launcher reads`() {
        assertEquals("y-review-channel.jar", ChannelServer.FILE_NAME)
        assertEquals("channel", ChannelServer.FOLDER_NAME)
    }

    @Test
    fun `the identifier is the one the descriptor of the plugin carries`() {
        assertEquals("com.yeskiy.yreview", ChannelServer.PLUGIN_ID)
        assertTrue(
            File("src/main/resources/META-INF/plugin.xml").readText()
                .contains("<id>${ChannelServer.PLUGIN_ID}</id>")
        )
    }

    @Test
    fun `the build writes the server where this search looks for it`() {
        // Two files outside Kotlin decide the place. A drift there breaks the channel and
        // no compiler reports it, so the names stay under a test.
        assertTrue(
            File("build.gradle.kts").readText()
                .contains("val channelFolder = \"${ChannelServer.FOLDER_NAME}\""),
            "the sandbox rule must name the folder that ChannelServer reads"
        )
        assertTrue(
            File("channel-server/build.gradle.kts").readText()
                .contains("archiveFileName = \"${ChannelServer.FILE_NAME}\""),
            "the channel-server build must write the file name that ChannelServer reads"
        )
    }

    @Test
    fun `the main class is the one the channel-server module holds`() {
        assertTrue(
            File("channel-server/src/main/kotlin/com/yeskiy/yreview/channel/Main.kt").isFile,
            "the channel server must hold a Main.kt that the launcher runs"
        )
        assertEquals("com.yeskiy.yreview.channel.MainKt", ChannelServer.MAIN_CLASS)
    }

    @Test
    fun `a search outside a running IDE answers instead of failing`() {
        // No platform runs here, so the plugin folder stays unknown and nothing throws.
        assertEquals(ChannelServer.Answer.Unknown, ChannelServer.locate())
    }
}
