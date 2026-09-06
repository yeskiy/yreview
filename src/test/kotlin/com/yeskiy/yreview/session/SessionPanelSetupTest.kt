package com.yeskiy.yreview.session

import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.settings.ReviewSettings
import java.nio.file.Files
import java.nio.file.Path

/**
 * Where one start writes the files of a session.
 *
 * A start writes the password file of the session, and a file write holds the thread that
 * runs it. That thread must never be the thread that draws the window, because the window
 * paints nothing while a write runs.
 *
 * These tests hold the thread that draws the window themselves. The loop pumps no event,
 * so nothing of the mount can run inside it. A file that appears while that loop runs came
 * from another thread, and no other reading of the result is open.
 *
 * The agent is OpenCode, because only an agent that runs a server of its own gets a
 * password file. The channel stands off, so the lookup of the bridge answers at once and
 * no bridge starts.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class SessionPanelSetupTest : BasePlatformTestCase() {

    private var secret: Path? = null

    override fun tearDown() {
        try {
            secret?.let { Files.deleteIfExists(it) }
        } finally {
            super.tearDown()
        }
    }

    fun `test the start writes the password file off the thread that draws the window`() {
        val panel = panel()

        panel.start()
        val written = await { Files.exists(secretOf(panel)) }
        panel.dispose()

        assertTrue("the password file must be written while this thread is held", written)
    }

    fun `test a tab that closed during the start leaves no password on the disk`() {
        val panel = panel()

        panel.start()
        panel.dispose()
        drain()

        assertFalse(
            "a tab that closed must take its password back off the disk",
            Files.exists(secretOf(panel)),
        )
    }

    /** A panel of an agent that runs a server of its own. Its terminal never opens. */
    private fun panel(): SessionPanel {
        ReviewSettings.getInstance(project).agent = AgentId.OPENCODE
        ReviewSettings.getInstance(project).channel = false
        return SessionPanel(project, 1, false, { null }) { }.also { secret = secretOf(it) }
    }

    /** The path of the password file of one tab. The test removes it after the run. */
    private fun secretOf(panel: SessionPanel): Path = SecretFile.forSession(panel.sessionKey).path

    /**
     * Waits for [ready] while this thread holds the thread that draws the window.
     *
     * The loop pumps no event of the queue, so no work of the mount runs inside it.
     */
    private fun await(ready: () -> Boolean): Boolean {
        val deadline = System.currentTimeMillis() + WAIT_MILLIS
        while (System.currentTimeMillis() < deadline) {
            if (ready()) return true
            Thread.sleep(STEP_MILLIS)
        }
        return false
    }

    /** Gives the pooled thread and the queue their turn, so every step of the start ends. */
    private fun drain() {
        val deadline = System.currentTimeMillis() + DRAIN_MILLIS
        while (System.currentTimeMillis() < deadline) {
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            Thread.sleep(STEP_MILLIS)
        }
    }

    private companion object {
        const val WAIT_MILLIS = 10_000L
        const val DRAIN_MILLIS = 1_000L
        const val STEP_MILLIS = 10L
    }
}
