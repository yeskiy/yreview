package com.yeskiy.yreview.session

import com.intellij.openapi.util.Disposer
import com.intellij.terminal.TerminalTitle
import com.intellij.terminal.frontend.view.TerminalView
import com.intellij.terminal.frontend.view.TerminalViewSessionState
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.ui.content.ContentFactory
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import javax.swing.JPanel
import javax.swing.JTextArea
import kotlin.coroutines.EmptyCoroutineContext

/**
 * What one panel does when the terminal behind it stops.
 *
 * The panel follows the state flow of the terminal view, and that flow runs on a scope
 * that the terminal owns. A cancelled scope drops the report of the end. The tab then
 * carries no mark, the status line keeps the sentence of the start, and the user reads
 * nothing about a session that is already gone.
 *
 * The terminal of these tests reports a process that stopped, and its scope is cancelled,
 * so the flow reports nothing at all. What the panel shows therefore rests on the state
 * that the terminal holds, and on nothing else.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class SessionPanelEndTest : BasePlatformTestCase() {

    override fun tearDown() {
        try {
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    /** A session whose process stopped, and whose flow can report nothing. */
    private fun deadSession(): ReviewSession {
        val contents = ContentFactory.getInstance().createContentManager(false, project)
        return ReviewSession(stoppedView(), contents)
    }

    /**
     * Opens one panel with a terminal that stopped, and waits for the mount.
     *
     * The start hands the bridge lookup to a pooled thread, and that thread hands the
     * mount back to the user interface thread. The pump gives both their turn.
     */
    private fun mounted(states: MutableList<SessionState>): SessionPanel {
        ReviewSettings.getInstance(project).agent = AgentId.AIDER
        val panel = SessionPanel(project, 1, false, { deadSession() }) { states += it }
        Disposer.register(testRootDisposable, panel)
        panel.start()
        val deadline = System.currentTimeMillis() + SETTLE_MILLIS
        while (states.size < MOUNT_REPORTS && System.currentTimeMillis() < deadline) {
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            Thread.sleep(STEP_MILLIS)
        }
        assertEquals(listOf(SessionState.STARTING, SessionState.RUNNING), states)
        return panel
    }

    /** The text of the status line of the panel. It stands under the terminal. */
    private fun status(panel: SessionPanel): String =
        panel.components.filterIsInstance<JTextArea>().single().text

    fun `test a panel whose terminal stopped reports the end of the session`() {
        val states = mutableListOf<SessionState>()
        val panel = mounted(states)

        val running = panel.isRunning

        assertFalse(running)
        assertEquals(
            listOf(SessionState.STARTING, SessionState.RUNNING, SessionState.ENDED),
            states,
        )
    }

    fun `test the status line names the session that ended at once`() {
        val panel = mounted(mutableListOf())

        panel.isRunning

        assertEquals(
            "The review session ended at once. The terminal above holds the reason. " +
                "A command that the shell cannot find ends a session this way.",
            status(panel),
        )
    }

    fun `test a panel whose terminal stopped starts a new session`() {
        val states = mutableListOf<SessionState>()
        val panel = mounted(states)

        panel.start()

        assertEquals(SessionState.ENDED, states[2])
        assertEquals(SessionState.STARTING, states[3])
    }

    private companion object {
        const val SETTLE_MILLIS = 30000L
        const val STEP_MILLIS = 10L
        const val MOUNT_REPORTS = 2
    }
}

/**
 * A terminal view of a process that stopped.
 *
 * The scope is cancelled, so a collector of the state flow never runs. Every member that
 * these tests do not need throws, so an unexpected call fails loudly.
 */
private fun stoppedView(): TerminalView = JPanel().let { panel ->
    fakeTerminalView(
        mapOf(
            "getCoroutineScope" to CoroutineScope(EmptyCoroutineContext).apply { cancel() },
            "getComponent" to panel,
            "getPreferredFocusableComponent" to panel,
            "getTitle" to TerminalTitle(),
            "getSessionState" to MutableStateFlow(TerminalViewSessionState.Terminated),
        ),
        "This terminal view carries a process that stopped and nothing else.",
    )
}
