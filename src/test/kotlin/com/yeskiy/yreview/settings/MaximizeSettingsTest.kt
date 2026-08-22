package com.yeskiy.yreview.settings

import com.intellij.util.xmlb.XmlSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The value of the IDE installation, as misc/registry.properties holds it. */
private const val DEFAULT_SIZE = "30"

/** One strip that answers from memory, so a test reads every write of the plugin. */
private class FakeStrip(
    private var current: String = DEFAULT_SIZE,
    private val changed: Boolean = false,
) : EditorStrip {

    val writes = mutableListOf<String>()

    var resets = 0
        private set

    override fun size(): String = current

    override fun changedFromDefault(): Boolean = changed

    override fun set(size: String) {
        current = size
        writes.add(size)
    }

    override fun reset() {
        current = DEFAULT_SIZE
        resets++
    }
}

class MaximizeSettingsTest {

    private fun settings(state: MaximizeSettings.State = MaximizeSettings.State()): MaximizeSettings =
        MaximizeSettings().apply { loadState(state) }

    private fun read(state: MaximizeSettings.State): MaximizeSettings.State =
        XmlSerializer.deserialize(XmlSerializer.serialize(state), MaximizeSettings.State::class.java)

    @Test
    fun `the switch starts off and holds no earlier value`() {
        assertFalse(MaximizeSettings.State().full)
        assertEquals("", MaximizeSettings.State().previous)
    }

    @Test
    fun `the state survives a write and a read`() {
        val state = MaximizeSettings.State()
        state.full = true
        state.previous = "45"

        assertTrue(read(state).full)
        assertEquals("45", read(state).previous)
    }

    @Test
    fun `an off switch that stays off writes nothing`() {
        val strip = FakeStrip()
        settings().switch(false, strip)

        assertEquals(emptyList(), strip.writes)
        assertEquals(0, strip.resets)
    }

    @Test
    fun `the switch on writes zero`() {
        val strip = FakeStrip()
        val settings = settings()
        settings.switch(true, strip)

        assertTrue(settings.full)
        assertEquals(listOf("0"), strip.writes)
    }

    @Test
    fun `the switch on twice writes once`() {
        val strip = FakeStrip()
        val settings = settings()
        settings.switch(true, strip)
        settings.switch(true, strip)

        assertEquals(listOf("0"), strip.writes)
    }

    @Test
    fun `the switch off drops the value of the plugin when the user held no value`() {
        val strip = FakeStrip()
        val settings = settings()
        settings.switch(true, strip)
        settings.switch(false, strip)

        assertFalse(settings.full)
        assertEquals(listOf("0"), strip.writes)
        assertEquals(1, strip.resets)
        assertEquals(DEFAULT_SIZE, strip.size())
    }

    @Test
    fun `the switch off writes the value of the user again`() {
        val strip = FakeStrip("45", changed = true)
        val settings = settings()
        settings.switch(true, strip)
        settings.switch(false, strip)

        assertEquals(listOf("0", "45"), strip.writes)
        assertEquals(0, strip.resets)
    }

    @Test
    fun `a hand written zero of the user comes back`() {
        val strip = FakeStrip("0", changed = true)
        val settings = settings()
        settings.switch(true, strip)
        settings.switch(false, strip)

        assertEquals(listOf("0"), strip.writes)
        assertEquals(0, strip.resets)
        assertEquals("0", strip.size())
    }

    @Test
    fun `a start with the switch on writes zero`() {
        val strip = FakeStrip("45", changed = true)
        settings(MaximizeSettings.State().apply { full = true }).start(strip)

        assertEquals(listOf("0"), strip.writes)
    }

    @Test
    fun `a start with the switch off writes nothing`() {
        val strip = FakeStrip()
        settings().start(strip)

        assertEquals(emptyList(), strip.writes)
        assertEquals(0, strip.resets)
    }

    @Test
    fun `a start writes nothing when the value already stands at zero`() {
        val strip = FakeStrip("0", changed = true)
        settings(MaximizeSettings.State().apply { full = true }).start(strip)

        assertEquals(emptyList(), strip.writes)
    }

    @Test
    fun `a start keeps the value the user held before the switch`() {
        val settings = settings()
        settings.switch(true, FakeStrip("45", changed = true))
        settings.start(FakeStrip("0", changed = true))

        val strip = FakeStrip("0", changed = true)
        settings.switch(false, strip)

        assertEquals(listOf("45"), strip.writes)
    }
}
