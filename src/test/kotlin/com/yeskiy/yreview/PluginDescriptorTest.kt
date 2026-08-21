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

    private val shortcut = "<keyboard-shortcut keymap=\"\$default\" first-keystroke=\"control shift G\" />"

    private val commentActions = listOf("com.yeskiy.yreview.AddComment", "com.yeskiy.yreview.AddDiffComment")

    /** The macOS keymaps turn an inherited control stroke into a meta stroke, so both forms go. */
    private val macRemovals = listOf("Mac OS X", "Mac OS X 10.5+").flatMap { keymap ->
        listOf("control shift G", "meta shift G").map {
            "<keyboard-shortcut keymap=\"$keymap\" first-keystroke=\"$it\" remove=\"true\" />"
        }
    }

    private fun actionOf(id: String): String =
        plugin.substringAfter("<action id=\"$id\"").substringBefore("</action>")

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
    fun `both comment actions answer the same keystroke`() {
        assertEquals(2, plugin.split(shortcut).size - 1, "the editor action and the diff action share one stroke")
        commentActions.forEach {
            assertTrue(actionOf(it).contains(shortcut), "$it must answer control shift G")
        }
    }

    @Test
    fun `the keystroke stays away from the macOS keymaps`() {
        commentActions.forEach { action ->
            macRemovals.forEach {
                assertTrue(actionOf(action).contains(it), "$action must not steal a macOS stroke: $it")
            }
        }
    }

    @Test
    fun `the session tool window keeps its identifier`() {
        assertTrue(
            terminal.contains("id=\"Claude Review\""),
            "the visible name comes from the factory, so the saved layout of the user survives"
        )
    }
}
