package com.yeskiy.yreview.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.session.AgentScan
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * What the settings page does with the answer of the search for the installed agents.
 *
 * A user can install an agent while the project stays open. The page must therefore ask
 * for one search every time it opens, and it must never read the answer of an old search
 * alone. The search reads folders on disk, so it never runs on the user interface thread.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class AgentScanRefreshTest : BasePlatformTestCase() {

    fun `test the search never runs on the user interface thread`() {
        val onUiThread = AtomicBoolean(true)
        val done = CountDownLatch(1)

        AgentScan.getInstance().refresh {
            onUiThread.set(ApplicationManager.getApplication().isDispatchThread)
            done.countDown()
        }

        assertTrue("The search gave no answer in $WAIT_SECONDS seconds.", done.await(WAIT_SECONDS, TimeUnit.SECONDS))
        assertFalse("The search ran on the user interface thread.", onUiThread.get())
    }

    fun `test every open of the settings page asks for a fresh search`() {
        val first = search()
        assertTrue("The first search did not finish.", first.scanned)

        val page = ReviewConfigurable(project)
        page.createComponent()
        page.reset()

        assertNotSame("The page kept the answer of the earlier search.", first, answerAfter(first))
    }

    /** Runs one search and answers what it found. */
    private fun search(): AgentScan.Answer {
        val done = CountDownLatch(1)
        AgentScan.getInstance().refresh { done.countDown() }
        assertTrue("The search gave no answer in $WAIT_SECONDS seconds.", done.await(WAIT_SECONDS, TimeUnit.SECONDS))
        return AgentScan.getInstance().latest()
    }

    /** The answer of the next search, or [earlier] again when no other search ran. */
    private fun answerAfter(earlier: AgentScan.Answer): AgentScan.Answer {
        val deadline = System.currentTimeMillis() + WAIT_SECONDS * 1000
        while (System.currentTimeMillis() < deadline) {
            val now = AgentScan.getInstance().latest()
            if (now !== earlier) return now
            Thread.sleep(POLL_MILLISECONDS)
        }
        return earlier
    }

    private companion object {
        const val WAIT_SECONDS = 60L
        const val POLL_MILLISECONDS = 20L
    }
}
