package com.yeskiy.yreview.tasks

import com.intellij.testFramework.DumbModeTestUtils
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.util.concurrent.atomic.AtomicReference

/**
 * An agent that reports a finished task never waits for an index build.
 *
 * The report arrives on a thread of the bridge. A read of the TODO lines waits until the
 * index is ready, so that thread would hold for the whole build. The plugin answers with a
 * sentence instead, and the agent reports the identifiers again.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class TaskCompletionDumbTest : BasePlatformTestCase() {

    fun `test a reported todo item answers while the ide builds its index`() {
        val token = DumbModeTestUtils.startEternalDumbModeTask(project)
        val answer = AtomicReference<CloseReport?>(null)
        val work = closing(answer)
        val report = try {
            work.join(DEADLINE_MS)
            answer.get()
        } finally {
            DumbModeTestUtils.endEternalDumbModeTask(token)
            work.join(DEADLINE_MS)
        }

        assertNotNull("the plugin must answer while the IDE builds its index", report)
        assertEquals(0, report!!.closed)
        assertTrue(report.problem.orEmpty().contains(ClosePlan.INDEX_BUSY))
        assertTrue(report.problem.orEmpty().contains(TODO_ID))
    }

    fun `test a reported todo item closes while the index is ready`() {
        val answer = AtomicReference<CloseReport?>(null)
        val work = closing(answer)
        work.join(DEADLINE_MS)
        val report = answer.get()

        assertNotNull("the plugin must answer while the index is ready", report)
        assertEquals(1, report!!.closed)
        assertNull(report.problem)
    }

    /** Closes the identifier away from the thread that runs the test, and starts at once. */
    private fun closing(answer: AtomicReference<CloseReport?>): Thread =
        Thread { answer.set(TaskCompletion.getInstance(project).close(listOf(TODO_ID))) }
            .also {
                it.isDaemon = true
                it.start()
            }

    private companion object {
        val TODO_ID: String = TaskIds.forTodo("src/Main.kt", 12)

        const val DEADLINE_MS = 5_000L
    }
}
