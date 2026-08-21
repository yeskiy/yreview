package com.yeskiy.yreview.action

import kotlin.test.Test
import kotlin.test.assertEquals

class CommentTargetTest {

    @Test
    fun `the box sits under the last line of the selection`() {
        assertEquals(40, Target("a.kt", 12, 40).lastLine)
    }

    @Test
    fun `a caret with no selection names one line`() {
        assertEquals(12, Target("a.kt", 12, 12).lastLine)
    }

    @Test
    fun `a range that ends before it starts still names its last line`() {
        assertEquals(40, Target("a.kt", 40, 12).lastLine)
    }
}
