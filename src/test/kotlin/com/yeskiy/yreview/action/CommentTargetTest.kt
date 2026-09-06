package com.yeskiy.yreview.action

import com.yeskiy.yreview.store.Range
import kotlin.test.Test
import kotlin.test.assertEquals

class CommentTargetTest {

    @Test
    fun `the box sits under the last line of the selection`() {
        assertEquals(40, Target("a.kt", Range(startLine = 12, endLine = 40)).lastLine)
    }

    @Test
    fun `a caret with no selection names one line`() {
        assertEquals(12, Target("a.kt", Range(startLine = 12, endLine = 12)).lastLine)
    }

    @Test
    fun `a range that ends before it starts still names its last line`() {
        assertEquals(40, Target("a.kt", Range(startLine = 40, endLine = 12)).lastLine)
    }
}
