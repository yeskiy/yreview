package com.yeskiy.yreview.session

import java.awt.EventQueue
import javax.swing.JPanel
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The panel of a tool window can hold no size while the platform builds the content. The
 * gate must hold the session until the frame lays the panel out.
 */
class SizeGateTest {

    private val panel = JPanel()

    private var runs = 0

    /** The toolkit posts the resize event, so the test waits for the event queue. */
    private fun resize(width: Int, height: Int) {
        panel.setSize(width, height)
        EventQueue.invokeAndWait { }
    }

    @Test
    fun `runs at once for a component that holds a size`() {
        panel.setSize(600, 200)
        SizeGate.run(panel) { runs++ }
        assertEquals(1, runs)
    }

    @Test
    fun `waits for a component of zero size`() {
        SizeGate.run(panel) { runs++ }
        assertEquals(0, runs, "a session must not start before the frame lays the panel out")
        resize(600, 200)
        assertEquals(1, runs)
    }

    @Test
    fun `runs once, whatever the number of later resizes`() {
        SizeGate.run(panel) { runs++ }
        resize(600, 200)
        resize(700, 300)
        resize(800, 400)
        assertEquals(1, runs, "a later resize must not open a second session")
    }

    @Test
    fun `keeps waiting while the height stays at zero`() {
        SizeGate.run(panel) { runs++ }
        resize(600, 0)
        assertEquals(0, runs, "a terminal of zero rows reads no true size")
        resize(600, 200)
        assertEquals(1, runs)
    }
}
