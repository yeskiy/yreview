package com.yeskiy.yreview.bench

import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.runInEdtAndGet
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.tasks.NoteScan
import com.yeskiy.yreview.tasks.TaskScope
import com.yeskiy.yreview.toolwindow.ReviewTreePanel

/** The bench reads these members. JUnit 3 finds a test by the prefix test. */
class BenchHooksTest : BasePlatformTestCase() {

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

    fun testTheBenchHooksExist() {
        NoteScan.forget()
        val panel = runInEdtAndGet { ReviewTreePanel(project, TaskScope.PROJECT) }
        try {
            assertEquals(0L, panel.state.ticket.coerceAtMost(0L))
            assertNotNull(panel.tree)
            assertNotNull(panel.queue)
            assertNotNull(panel.repositories)
        } finally {
            runInEdtAndGet { Disposer.dispose(panel) }
        }
    }
}
