package com.yeskiy.yreview.store

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.util.concurrent.atomic.AtomicReference

/**
 * Where a write of the store runs.
 *
 * A write starts git, and git must never run on the thread that draws the window. The
 * answer and every failure still reach the caller, because a user who wrote a comment must
 * read what happened to it.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class StoreWriteTest : BasePlatformTestCase() {

    fun `test the work leaves the thread that draws the window`() {
        assertTrue("the fixture must run this test on the thread that draws the window", onDrawingThread())

        val ranOnDrawingThread = StoreWrite.run(project, TITLE) { onDrawingThread() }

        assertFalse("git must never run on the thread that draws the window", ranOnDrawingThread)
    }

    fun `test a caller that already stands off that thread keeps its own thread`() {
        val caller = AtomicReference<Thread?>(null)
        val ran = AtomicReference<Thread?>(null)
        val work = Thread {
            caller.set(Thread.currentThread())
            ran.set(StoreWrite.run(project, TITLE) { Thread.currentThread() })
        }

        work.start()
        work.join(DEADLINE_MS)

        assertNotNull("the work must end", ran.get())
        assertSame(caller.get(), ran.get())
    }

    fun `test the answer of the work reaches the caller`() {
        assertEquals("written", StoreWrite.run(project, TITLE) { "written" })
    }

    fun `test a failure of the work reaches the caller`() {
        val failure = try {
            StoreWrite.run<String>(project, TITLE) { throw NotesWriteException("git refused the note") }
            null
        } catch (refused: NotesWriteException) {
            refused
        }

        assertNotNull("the caller must read why the write failed", failure)
        assertEquals("git refused the note", failure!!.message)
    }

    private fun onDrawingThread(): Boolean = ApplicationManager.getApplication().isDispatchThread

    private companion object {
        const val TITLE = "Writing the Review Comment"

        const val DEADLINE_MS = 30_000L
    }
}
