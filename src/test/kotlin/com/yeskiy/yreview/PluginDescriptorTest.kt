package com.yeskiy.yreview

import com.yeskiy.yreview.settings.ProductName
import com.yeskiy.yreview.settings.SessionWindow
import com.yeskiy.yreview.ui.ReviewNotice
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

    private val maximizeStartup =
        "<postStartupActivity implementation=\"com.yeskiy.yreview.settings.MaximizeStartup\" />"

    private val icon = "icon=\"/icons/yReviewAddComment.svg\""

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
    fun `every start writes the size of the main splitter again`() {
        assertTrue(
            plugin.contains(maximizeStartup),
            "a switch that stands on must reach the splitter after a start of the IDE"
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
    fun `the color scheme page reaches the settings of the user`() {
        assertTrue(
            plugin.contains("<colorSettingsPage implementation=\"com.yeskiy.yreview.settings.ReviewColorsPage\" />"),
            "without this line the user cannot change the color of a comment range"
        )
    }

    @Test
    fun `the session tool window keeps its identifier`() {
        assertTrue(
            terminal.contains("id=\"${SessionWindow.ID}\""),
            "the settings page shows and hides the window by this identifier"
        )
        assertEquals("Claude Review", SessionWindow.ID)
    }

    @Test
    fun `the plugin carries the product name`() {
        assertTrue(
            plugin.contains("<name>${ProductName.TEXT}</name>"),
            "the plugin list of the IDE shows this name"
        )
    }

    @Test
    fun `the settings page carries the product name`() {
        assertTrue(
            plugin.contains("displayName=\"${ProductName.TEXT}\""),
            "the settings tree and ReviewConfigurable must show one name"
        )
    }

    @Test
    fun `the review tool window carries the product name`() {
        assertTrue(
            plugin.contains("<toolWindow id=\"${ProductName.TEXT}\""),
            "the stripe shows this identifier, because the window sets no stripe title"
        )
    }

    @Test
    fun `the intention group carries the product name`() {
        assertTrue(
            plugin.contains("<category>${ProductName.TEXT}</category>"),
            "the intention list and AddCommentIntention must show one name"
        )
    }

    /**
     * The identifier of the notification group is a key, and no compiler compares the two
     * places that hold it. A group that the descriptor does not register gives no balloon.
     */
    @Test
    fun `the notification group identifier matches the code that asks for it`() {
        assertTrue(
            plugin.contains("<notificationGroup id=\"${ReviewNotice.GROUP}\""),
            "the descriptor registers the group, and ReviewNotice asks for it by this identifier"
        )
        assertEquals(ProductName.TEXT, ReviewNotice.GROUP)
    }
}
