package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.session.SessionToolWindowFactory
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Both tool windows open while the IDE builds the index.
 *
 * ToolWindowFactory extends PossiblyDumbAware, and the default answer of isDumbAware reads
 * "this instanceof DumbAware". A factory that drops the DumbAware interface still compiles,
 * and the platform then hides the window behind its own message. These tests read the
 * answer of the platform, so such a change fails here.
 */
class DumbAwareWindowTest {

    @Test
    fun `the review window opens while the index builds`() {
        assertTrue(ReviewToolWindowFactory().isDumbAware)
    }

    @Test
    fun `the session window opens while the index builds`() {
        assertTrue(SessionToolWindowFactory().isDumbAware)
    }
}
