package com.yeskiy.yreview.settings

import com.intellij.util.xmlb.XmlSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class ReviewViewStateTest {

    private fun read(state: ReviewSettings.State): ReviewSettings.State =
        XmlSerializer.deserialize(XmlSerializer.serialize(state), ReviewSettings.State::class.java)

    @Test
    fun `starts with one flat tree and no filter`() {
        val state = ReviewSettings.State()

        assertFalse(state.byModule)
        assertFalse(state.byDirectory)
        assertFalse(state.flattenDirectories)
        assertFalse(state.autoScrollToSource)
        assertFalse(state.showPreview)
        assertEquals("", state.todoFilterName)
    }

    @Test
    fun `keeps every group toggle after a write and a read`() {
        val state = ReviewSettings.State()
        state.byModule = true
        state.byDirectory = true
        state.flattenDirectories = true

        val back = read(state)

        assertEquals(true, back.byModule)
        assertEquals(true, back.byDirectory)
        assertEquals(true, back.flattenDirectories)
    }

    @Test
    fun `keeps the filter name after a write and a read`() {
        val state = ReviewSettings.State()
        state.todoFilterName = "Only FIXME"

        assertEquals("Only FIXME", read(state).todoFilterName)
    }

    @Test
    fun `keeps the scroll and the preview toggle after a write and a read`() {
        val state = ReviewSettings.State()
        state.autoScrollToSource = true
        state.showPreview = true

        val back = read(state)

        assertEquals(true, back.autoScrollToSource)
        assertEquals(true, back.showPreview)
    }

    @Test
    fun `keeps the current file toggle beside the new ones`() {
        val state = ReviewSettings.State()
        state.currentFileOnly = true
        state.byDirectory = true

        val back = read(state)

        assertEquals(true, back.currentFileOnly)
        assertEquals(true, back.byDirectory)
    }
}
