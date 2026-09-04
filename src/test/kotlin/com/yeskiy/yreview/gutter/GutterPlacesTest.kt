package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.diff.DiffAnchor
import com.yeskiy.yreview.diff.DiffSide
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GutterPlacesTest {

    private val head = "9de1122"

    private val older = "4f2c8b1"

    private val tree = GutterPlace(head, "src/Main.kt")

    @Test
    fun `an editor of a file draws the comments of the working tree`() {
        assertEquals(tree, GutterPlaces.of(null, tree))
    }

    @Test
    fun `a left side draws the comments of its own revision`() {
        val side = DiffAnchor(DiffSide.LEFT, older, "src/Main.kt", dirty = false)
        assertEquals(GutterPlace(older, "src/Main.kt"), GutterPlaces.of(side, tree))
    }

    @Test
    fun `a right side draws the comments of its own revision`() {
        val side = DiffAnchor(DiffSide.RIGHT, head, "src/Main.kt", dirty = false)
        assertEquals(GutterPlace(head, "src/Main.kt"), GutterPlaces.of(side, tree))
    }

    @Test
    fun `a renamed file keeps the path of its own side`() {
        val side = DiffAnchor(DiffSide.LEFT, older, "src/Old.kt", dirty = false)
        assertEquals(GutterPlace(older, "src/Old.kt"), GutterPlaces.of(side, tree))
    }

    @Test
    fun `a side draws even when the working tree holds no file`() {
        val side = DiffAnchor(DiffSide.LEFT, older, "src/Gone.kt", dirty = false)
        assertEquals(GutterPlace(older, "src/Gone.kt"), GutterPlaces.of(side, null))
    }

    @Test
    fun `an editor without a side and without a file draws nothing`() {
        assertNull(GutterPlaces.of(null, null))
    }

    @Test
    fun `a dirty right side draws the comments of the head`() {
        val side = DiffAnchor(DiffSide.RIGHT, head, "src/Main.kt", dirty = true)
        assertEquals(GutterPlace(head, "src/Main.kt"), GutterPlaces.of(side, GutterPlace(older, "src/Main.kt")))
    }
}
