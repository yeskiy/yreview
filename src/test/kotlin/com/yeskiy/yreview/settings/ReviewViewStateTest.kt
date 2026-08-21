package com.yeskiy.yreview.settings

import com.intellij.openapi.util.JDOMUtil
import com.intellij.util.xmlb.SkipDefaultsSerializationFilter
import com.intellij.util.xmlb.XmlSerializer
import com.yeskiy.yreview.tasks.TaskKindFilter
import com.yeskiy.yreview.tasks.TaskScope
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ReviewViewStateTest {

    private fun read(state: ReviewSettings.State): ReviewSettings.State =
        XmlSerializer.deserialize(XmlSerializer.serialize(state), ReviewSettings.State::class.java)

    /** The text of y-review.xml. The store of the platform drops every value of the default. */
    private fun store(state: ReviewSettings.State): String =
        JDOMUtil.write(XmlSerializer.serialize(state, SkipDefaultsSerializationFilter()))

    @Test
    fun `starts with one flat tree and no filter`() {
        val state = ReviewSettings.TabState()

        assertFalse(state.byModule)
        assertFalse(state.byDirectory)
        assertFalse(state.flattenDirectories)
        assertFalse(state.autoScrollToSource)
        assertEquals("", state.todoFilterName)
        assertEquals(TaskKindFilter.BOTH, state.kindFilter)
        assertEquals("", state.scopeId)
    }

    @Test
    fun `a fresh state opens the preview pane`() {
        assertTrue(ReviewSettings.TabState().showPreview)
        assertTrue(ReviewSettings.State().projectTab.showPreview)
        assertTrue(ReviewSettings().tab(TaskScope.PROJECT).showPreview)
    }

    @Test
    fun `the store writes the preview only after the user closes it`() {
        val closed = ReviewSettings.State()
        closed.projectTab.showPreview = false

        assertFalse(store(ReviewSettings.State()).contains("showPreview"))
        assertTrue(store(closed).contains("<option name=\"showPreview\" value=\"false\" />"))
    }

    @Test
    fun `an old file that stores the closed pane keeps it closed`() {
        val old = "<State>" +
            "<option name=\"projectTab\">" +
            "<TabState><option name=\"showPreview\" value=\"false\" /></TabState>" +
            "</option>" +
            "</State>"

        val back = XmlSerializer.deserialize(JDOMUtil.load(old), ReviewSettings.State::class.java)

        assertFalse(back.projectTab.showPreview)
        assertTrue(back.currentFileTab.showPreview)
    }

    @Test
    fun `an old file that names no tab opens the preview pane`() {
        val old = "<State><option name=\"sharing\" value=\"SHARED\" /></State>"

        val back = XmlSerializer.deserialize(JDOMUtil.load(old), ReviewSettings.State::class.java)

        assertTrue(back.projectTab.showPreview)
    }

    @Test
    fun `the closed pane survives a write and a read`() {
        val state = ReviewSettings.State()
        state.projectTab.showPreview = false

        val back = XmlSerializer.deserialize(JDOMUtil.load(store(state)), ReviewSettings.State::class.java)

        assertFalse(read(state).projectTab.showPreview)
        assertFalse(back.projectTab.showPreview)
    }

    @Test
    fun `keeps every group toggle after a write and a read`() {
        val state = ReviewSettings.State()
        state.projectTab.byModule = true
        state.projectTab.byDirectory = true
        state.projectTab.flattenDirectories = true

        val back = read(state).projectTab

        assertEquals(true, back.byModule)
        assertEquals(true, back.byDirectory)
        assertEquals(true, back.flattenDirectories)
    }

    @Test
    fun `keeps the filter name after a write and a read`() {
        val state = ReviewSettings.State()
        state.projectTab.todoFilterName = "Only FIXME"

        assertEquals("Only FIXME", read(state).projectTab.todoFilterName)
    }

    @Test
    fun `keeps the kind filter after a write and a read`() {
        val state = ReviewSettings.State()
        state.projectTab.kindFilter = TaskKindFilter.COMMENTS

        assertEquals(TaskKindFilter.COMMENTS, read(state).projectTab.kindFilter)
    }

    @Test
    fun `keeps the scroll and the preview toggle after a write and a read`() {
        val state = ReviewSettings.State()
        state.projectTab.autoScrollToSource = true
        state.projectTab.showPreview = true

        val back = read(state).projectTab

        assertEquals(true, back.autoScrollToSource)
        assertEquals(true, back.showPreview)
    }

    @Test
    fun `keeps the scope of the scope based tab`() {
        val state = ReviewSettings.State()
        state.scopeTab.scopeId = "Production Files"

        assertEquals("Production Files", read(state).scopeTab.scopeId)
    }

    @Test
    fun `keeps the four tabs apart after a write and a read`() {
        val state = ReviewSettings.State()
        state.projectTab.byDirectory = true
        state.currentFileTab.showPreview = false
        state.scopeTab.kindFilter = TaskKindFilter.TODOS
        state.changeListTab.byModule = true

        val back = read(state)

        assertEquals(true, back.projectTab.byDirectory)
        assertFalse(back.currentFileTab.byDirectory)
        assertFalse(back.scopeTab.byDirectory)
        assertFalse(back.changeListTab.byDirectory)
        assertFalse(back.currentFileTab.showPreview)
        assertTrue(back.projectTab.showPreview)
        assertEquals(TaskKindFilter.TODOS, back.scopeTab.kindFilter)
        assertEquals(TaskKindFilter.BOTH, back.projectTab.kindFilter)
        assertEquals(true, back.changeListTab.byModule)
        assertFalse(back.projectTab.byModule)
    }

    @Test
    fun `builds the group toggles of one tab`() {
        val state = ReviewSettings.TabState()
        state.byModule = true
        state.flattenDirectories = true

        assertEquals(true, state.grouping().byModule)
        assertFalse(state.grouping().byDirectory)
        assertEquals(true, state.grouping().flatten)
    }

    @Test
    fun `names one state record per tab`() {
        assertEquals(4, TaskScope.entries.size)
        assertEquals(
            listOf("Project", "Current File", "Scope Based", "Changelist"),
            TaskScope.entries.map { it.title },
        )
    }

    @Test
    fun `gives every tab its own state record`() {
        val settings = ReviewSettings()

        assertEquals(TaskScope.entries.size, TaskScope.entries.map { settings.tab(it) }.distinct().size)
    }

    @Test
    fun `keeps the state of the changelist tab after a write and a read`() {
        val state = ReviewSettings.State()
        state.changeListTab.showPreview = true
        state.changeListTab.kindFilter = TaskKindFilter.COMMENTS

        val back = read(state).changeListTab

        assertEquals(true, back.showPreview)
        assertEquals(TaskKindFilter.COMMENTS, back.kindFilter)
    }
}
