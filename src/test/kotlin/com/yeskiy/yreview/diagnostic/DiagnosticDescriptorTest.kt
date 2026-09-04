package com.yeskiy.yreview.diagnostic

import com.yeskiy.yreview.settings.ProductName
import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Reads the descriptor of the plugin as text.
 *
 * A test cannot start an IDE here, so these checks hold the lines that only a running IDE
 * reads. Without the error handler the IDE offers no report button for this plugin, and
 * the loss shows up in no compiler message.
 */
class DiagnosticDescriptorTest {

    private val plugin = File("src/main/resources/META-INF/plugin.xml").readText()

    @Test
    fun `the descriptor registers the error handler`() {
        assertTrue(
            plugin.contains("<errorHandler implementation=\"com.yeskiy.yreview.diagnostic.ReviewErrorSubmitter\" />"),
            "without this line the error dialog offers only Disable Plugin",
        )
    }

    @Test
    fun `the descriptor registers the collector of the log archive`() {
        assertTrue(
            plugin.contains(
                "<troubleInfoCollector implementation=\"com.yeskiy.yreview.diagnostic.ReviewTroubleInfo\" />"
            ),
            "Help, Collect Logs and Diagnostic Data writes the report into troubleshooting.txt",
        )
    }

    @Test
    fun `the descriptor registers the copy action under the diagnostic tools of the help menu`() {
        assertTrue(plugin.contains("class=\"com.yeskiy.yreview.diagnostic.CopyDiagnosticsAction\""), "the action is gone")
        assertTrue(
            plugin.contains("<add-to-group group-id=\"HelpDiagnosticTools\" anchor=\"last\" />"),
            "a user looks for a diagnostic action in the Help menu",
        )
    }

    @Test
    fun `the copy action carries the product name`() {
        assertTrue(
            plugin.contains("text=\"Copy ${ProductName.TEXT} Diagnostic Report\""),
            "the action list of the IDE shows one name for this product",
        )
    }
}
