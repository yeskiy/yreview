package com.yeskiy.yreview

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Reads the descriptor of the plugin as text.
 *
 * A test cannot start an IDE here, so these checks hold the lines that only a running IDE
 * reads. A lost line is a feature that disappears without a compiler error.
 */
class PluginDescriptorTest {

    private val plugin = File("src/main/resources/META-INF/plugin.xml").readText()

    private val terminal = File("src/main/resources/META-INF/y-review-terminal.xml").readText()

    private val startup = "<postStartupActivity implementation=\"com.yeskiy.yreview.bridge.BridgeStartup\" />"

    private val icon = "icon=\"AllIcons.Diff.AddComment_14x14\""

    @Test
    fun `the project opens the bridge on its own`() {
        assertTrue(
            plugin.contains(startup),
            "a session must find the bridge whatever tool window the user opens first"
        )
    }

    @Test
    fun `both comment actions carry the review comment icon`() {
        assertEquals(2, plugin.split(icon).size - 1, "the editor action and the diff action need the icon")
    }

    @Test
    fun `the session tool window keeps its identifier`() {
        assertTrue(
            terminal.contains("id=\"Claude Review\""),
            "the visible name comes from the factory, so the saved layout of the user survives"
        )
    }
}
