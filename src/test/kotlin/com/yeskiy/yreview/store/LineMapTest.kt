package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LineMapTest {

    @Test
    fun `a broken quoted name gives null`() {
        assertNull(LineMap.unquote("\"a/x"))
        assertNull(LineMap.unquote("\"a/\\q\""))
        assertNull(LineMap.unquote("\"a/\\30\""))
    }

    @Test
    fun `a name without quotes loses one tab`() = assertEquals("a/my file", LineMap.unquote("a/my file\t"))

    @Test
    fun `a block with no path gives no file`() =
        assertEquals(emptyMap(), LineMap.parse("diff --git x\n@@ -1 +1 @@\n-a\n+b\n"))

    @Test
    fun `a reversed range of an unchanged file keeps its order`() =
        assertEquals(
            Carry.Same(Range(startLine = 8, endLine = 7)),
            LineMap.carry(
                FileDiff("a", false, false, listOf(Hunk(0, 0, 1, 1, emptyList()))),
                Range(startLine = 7, endLine = 6),
                listOf("n", "1", "2", "3", "4", "5", "6", "7"),
            ),
        )
}
