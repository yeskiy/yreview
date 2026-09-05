package com.yeskiy.yreview.session

import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings

/**
 * What one panel does after its tab closed.
 *
 * A start hands the bridge lookup to a pooled thread, and that thread hands the mount back
 * to the user interface thread. A tab that closed during the lookup must mount no terminal.
 * A terminal of a closed tab stands on no screen, and nothing is left to close it.
 *
 * The test runs on the user interface thread, so the mount cannot run between the start and
 * the close. The pump then gives the pooled thread its turn.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class SessionPanelCloseTest : BasePlatformTestCase() {

    override fun tearDown() {
        try {
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    fun `test a panel that closed during the bridge wait mounts nothing`() {
        ReviewSettings.getInstance(project).agent = AgentId.AIDER
        val states = mutableListOf<SessionState>()
        val panel = SessionPanel(project, 1, false) { states += it }

        panel.start()
        panel.dispose()
        settle(states)

        assertEquals(listOf(SessionState.STARTING), states)
    }

    /**
     * Pumps the user interface thread until the mount reported a state, or until the time
     * runs out. A panel that mounts nothing waits the whole time.
     */
    private fun settle(states: List<SessionState>) {
        val deadline = System.currentTimeMillis() + SETTLE_MILLIS
        while (states.size < REPORTS && System.currentTimeMillis() < deadline) {
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            Thread.sleep(STEP_MILLIS)
        }
    }

    private companion object {
        const val SETTLE_MILLIS = 3000L
        const val STEP_MILLIS = 10L
        const val REPORTS = 2
    }
}
