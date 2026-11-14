package com.yeskiy.yreview.gutter

import java.awt.Color
import kotlin.test.Test
import kotlin.test.assertEquals

class CommentShadeTest {

    private val background = Color(255, 255, 255)

    private val base = Color(235, 245, 225)

    @Test
    fun `each comment adds the same step of tint again`() {
        assertEquals(
            listOf(base, Color(215, 235, 195), Color(195, 225, 165)),
            (1..3).map { CommentLayers.shade(base, background, it) },
        )
    }

    @Test
    fun `the tint stops at the cap of three comments`() {
        assertEquals(CommentLayers.shade(base, background, 3), CommentLayers.shade(base, background, 9))
    }

    @Test
    fun `the tint stays inside the color range on a dark background`() {
        assertEquals(Color(0, 170, 0), CommentLayers.shade(Color(10, 70, 0), Color(60, 20, 0), 3))
    }
}
