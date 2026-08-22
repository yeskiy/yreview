package com.yeskiy.yreview.session

import java.awt.Component
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent

/**
 * Runs an action after a component gets a real size.
 *
 * A parent gives a child its size. A component that no parent laid out stays at zero by
 * zero. A validate call on it lays out its children only, and it changes no bounds of its
 * own. The terminal runner reads that zero size. It then uses 80 columns by 24 rows, and
 * the window shows a scroll bar over output that fits.
 *
 * The action runs once. The listener leaves the component before the call, so a later
 * resize runs nothing.
 */
object SizeGate {

    /** Runs the action now when the component holds a size, and on the first size if not. */
    fun run(component: Component, action: () -> Unit) {
        if (sized(component)) return action()
        component.addComponentListener(object : ComponentAdapter() {
            override fun componentResized(event: ComponentEvent) {
                if (!sized(component)) return
                component.removeComponentListener(this)
                action()
            }
        })
    }

    private fun sized(component: Component): Boolean = component.width > 0 && component.height > 0
}
