package com.yeskiy.yreview.ui

import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.util.ui.JBUI
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * The floating window of the plugin. The window stays open on a click outside it, on a scroll,
 * and when another window takes the focus. A button or the Escape key closes it.
 */
object ReviewPopup {

    fun build(content: JComponent, focus: JComponent, title: String, minSize: Dimension): JBPopup =
        JBPopupFactory.getInstance()
            .createComponentPopupBuilder(content, focus)
            .setTitle(title)
            .setRequestFocus(true)
            .setFocusable(true)
            .setMovable(true)
            .setResizable(true)
            .setCancelOnClickOutside(false)
            .setCancelOnWindowDeactivation(false)
            .setCancelOnOtherWindowOpen(false)
            .setCancelKeyEnabled(true)
            .setMinSize(minSize)
            .createPopup()

    /** The row of controls along the bottom edge of a popup. */
    fun buttons(vararg controls: JButton): JPanel =
        JPanel(FlowLayout(FlowLayout.RIGHT, JBUI.scale(8), 0)).also { row ->
            controls.forEach { row.add(it) }
        }
}
