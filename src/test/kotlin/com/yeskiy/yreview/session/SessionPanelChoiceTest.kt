package com.yeskiy.yreview.session

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.ui.components.JBPanelWithEmptyText
import com.yeskiy.yreview.settings.ReviewSettings
import javax.swing.JTextArea

/**
 * What one tab shows after the choice of the project changed.
 *
 * A tab that waits paints the chooser while the project holds no agent. The settings page
 * writes a choice of its own, and it tells the window over the name topic. The tab must
 * then drop the chooser, because the project now holds a choice.
 *
 * No test here starts a terminal. The panel takes a source that answers null, so the tab
 * keeps the empty screen and every sentence of that screen stays readable.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class SessionPanelChoiceTest : BasePlatformTestCase() {

    fun `test the chooser goes when a choice reaches a tab that waits`() {
        settings().agent = null
        val panel = panel()
        try {
            assertEquals(AgentRows.CHOOSE, headline(panel))

            settings().agent = AgentId.COPILOT
            project.messageBus.syncPublisher(SESSION_NAMES).namesChanged()

            assertEquals("No review session runs.", headline(panel))
        } finally {
            panel.dispose()
        }
    }

    fun `test a tab of a project that chose No agent keeps its own sentence`() {
        settings().agent = AgentId.NONE
        val panel = panel()
        try {
            project.messageBus.syncPublisher(SESSION_NAMES).namesChanged()

            assertEquals(AgentRows.NO_AGENT, headline(panel))
        } finally {
            panel.dispose()
        }
    }

    fun `test a tab that is starting keeps the line of that start`() {
        settings().agent = AgentId.OPENCODE
        val panel = panel()
        try {
            panel.start()
            assertEquals(BRIDGE_WAIT, status(panel))

            project.messageBus.syncPublisher(SESSION_NAMES).namesChanged()

            assertEquals(BRIDGE_WAIT, status(panel))
        } finally {
            panel.dispose()
        }
    }

    /** A tab that never starts a terminal. Its empty screen carries every sentence. */
    private fun panel(): SessionPanel {
        settings().channel = false
        return SessionPanel(project, 1, false, { null }) { }
    }

    /** The first line of the empty screen of one tab. */
    private fun headline(panel: SessionPanel): String =
        panel.components.filterIsInstance<JBPanelWithEmptyText>().single().emptyText.text

    /** The status line of one tab. It is the only text area of the panel. */
    private fun status(panel: SessionPanel): String =
        panel.components.filterIsInstance<JTextArea>().single().text

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)

    private companion object {
        const val BRIDGE_WAIT = "The review bridge starts now. The session opens after the bridge answers."
    }
}
