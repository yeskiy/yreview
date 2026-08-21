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

    private fun expected(): String = plugin.resolve("channel").resolve("main.mjs").toString()

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
    fun `the file name keeps the module suffix that Node needs`() {
        // The plugin folder holds no package.json, so Node reads a .js file as a script of
        // the older kind. The bundle is a module, therefore the suffix must stay .mjs.
        assertEquals("main.mjs", ChannelServer.FILE_NAME)
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
            File("channel/package.json").readText().contains("bundle/${ChannelServer.FILE_NAME}"),
            "the bundler must write the file name that ChannelServer reads"
        )
    }

    @Test
    fun `a search outside a running IDE answers instead of failing`() {
        // No platform runs here, so the plugin folder stays unknown and nothing throws.
        assertEquals(ChannelServer.Answer.Unknown, ChannelServer.locate())
    }
}
