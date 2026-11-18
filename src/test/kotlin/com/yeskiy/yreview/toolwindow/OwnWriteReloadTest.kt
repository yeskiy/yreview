package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.tasks.ScanPhase
import com.yeskiy.yreview.tasks.TaskScope

/** A shown tab starts its reload at once after a comment write. JUnit 3 finds a test by the prefix test. */
class OwnWriteReloadTest : BasePlatformTestCase() {

    private var channel = true

    // A panel starts the bridge, and the later tests of the shared project expect it down.
    override fun setUp() {
        super.setUp()
        channel = ReviewSettings.getInstance(project).channel
        ReviewSettings.getInstance(project).channel = false
    }

    override fun tearDown() {
        try {
            ReviewSettings.getInstance(project).channel = channel
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    fun testAShownTabReloadsWithoutTheDelay() {
        val panel = ReviewTreePanel(project, TaskScope.PROJECT)
        try {
            panel.queue.showNotify()
            PlatformTestUtil.waitWithEventsDispatching("first scan", { panel.state.phase == ScanPhase.READY }, 30)
            val before = panel.state.ticket
            project.messageBus.syncPublisher(REVIEW_COMMENTS).commentsChanged()
            assertTrue(panel.state.ticket > before)
        } finally {
            Disposer.dispose(panel)
        }
    }

    fun testAHiddenTabWaitsForTheQueue() {
        val panel = ReviewTreePanel(project, TaskScope.PROJECT)
        try {
            val before = panel.state.ticket
            project.messageBus.syncPublisher(REVIEW_COMMENTS).commentsChanged()
            assertEquals(before, panel.state.ticket)
        } finally {
            Disposer.dispose(panel)
        }
    }
}
