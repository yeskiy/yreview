package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Every read of the store runs git, so a git that does not start fails many times in one
 * moment. The user reads one message about it, and not one message for every read.
 */
class GitStartNoticeTest {

    @Test
    fun `only the first call tells the user`() {
        val notice = GitStartNotice()

        assertTrue(notice.first(), "the first call must tell the user")
        assertFalse(notice.first())
        assertFalse(notice.first())
    }
}
