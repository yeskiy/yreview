package com.yeskiy.yreview.toolwindow

import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.util.ui.ThreeStateCheckBox
import com.intellij.util.ui.tree.TreeUtil
import com.yeskiy.yreview.tasks.CheckState
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.TreeCellRenderer

/**
 * Draws one row of the review tree, with a check box in front of it.
 *
 * The tree runs on an asynchronous model, and that model does not accept the check box
 * nodes of the platform. The check box therefore lives in the renderer, and the checked
 * identifiers live beside the model. The layout copies the platform renderer, so the row
 * keeps the look of a check box tree.
 *
 * A tree asks the component of the renderer for the tooltip of a row. That component is
 * this panel, so the panel takes over the tooltip of the text renderer inside it.
 */
class TaskCheckRenderer(private val state: (TaskHolder) -> CheckState) : JPanel(BorderLayout()), TreeCellRenderer {

    private val box = ThreeStateCheckBox().apply {
        isThirdStateEnabled = false
        isOpaque = false
        background = null
    }

    private val text = NodeRenderer()

    init {
        isOpaque = false
        background = null
        add(box, BorderLayout.WEST)
        add(text, BorderLayout.CENTER)
    }

    /** How wide the check box is, so the panel knows which clicks belong to it. */
    val boxWidth: Int get() = box.preferredSize.width

    override fun getTreeCellRendererComponent(
        tree: JTree,
        value: Any?,
        selected: Boolean,
        expanded: Boolean,
        leaf: Boolean,
        row: Int,
        hasFocus: Boolean,
    ): Component {
        invalidate()
        val holder = TreeUtil.getUserObject(value) as? TaskHolder
        box.isVisible = holder != null
        if (holder != null) box.state = swing(state(holder))
        text.getTreeCellRendererComponent(tree, value, selected, expanded, leaf, row, hasFocus)
        toolTipText = text.toolTipText
        revalidate()
        return this
    }

    private fun swing(value: CheckState): ThreeStateCheckBox.State = when (value) {
        CheckState.ALL -> ThreeStateCheckBox.State.SELECTED
        CheckState.SOME -> ThreeStateCheckBox.State.DONT_CARE
        CheckState.NONE -> ThreeStateCheckBox.State.NOT_SELECTED
    }
}
