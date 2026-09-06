package com.yeskiy.yreview.session

import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.settings.ReviewSettings
import javax.swing.JTextArea

/**
 * Where the idle status line of one tab reads the machine.
 *
 * The sentence names the bridge, the channel server and the Java runtime, and each one of
 * those asks the disk. The platform builds the content of a tool window on the thread that
 * draws the window, so none of those reads may run there.
 *
 * These tests hold that thread themselves. The panel is built inside the test, and the test
 * pumps no event before it reads the line. A sentence that stands there at once therefore
 * came from a read on this thread.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class SessionPanelStatusTest : BasePlatformTestCase() {

    fun `test the first paint carries no sentence that reads the disk`() {
        val panel = panel()
        try {
            assertEquals(
                "the status line must hold no sentence before the read of the disk ends",
                "",
                statusOf(panel),
            )
        } finally {
            panel.dispose()
        }
    }

    fun `test the sentence about the bridge arrives after the read ends`() {
        val panel = panel()
        try {
            drain()

            assertTrue(
                "the status line must carry the sentence once the read of the disk ends",
                statusOf(panel).isNotEmpty(),
            )
        } finally {
            panel.dispose()
        }
    }

    /** A panel of an agent that the plugin can run. Its terminal never opens. */
    private fun panel(): SessionPanel {
        ReviewSettings.getInstance(project).agent = AgentId.OPENCODE
        ReviewSettings.getInstance(project).channel = false
        return SessionPanel(project, 1, false, { null }) { }
    }

    /** The status line of one tab. It is the only text area of the panel. */
    private fun statusOf(panel: SessionPanel): String =
        panel.components.filterIsInstance<JTextArea>().single().text

    /** Gives the pooled thread and the queue their turn, so the read of the disk ends. */
    private fun drain() {
        val deadline = System.currentTimeMillis() + DRAIN_MILLIS
        while (System.currentTimeMillis() < deadline) {
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            Thread.sleep(STEP_MILLIS)
        }
    }

    private companion object {
        const val DRAIN_MILLIS = 2_000L
        const val STEP_MILLIS = 10L
    }
}
