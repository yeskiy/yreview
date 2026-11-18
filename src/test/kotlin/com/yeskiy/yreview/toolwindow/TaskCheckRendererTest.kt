package com.yeskiy.yreview.toolwindow

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.ThreeStateCheckBox
import com.yeskiy.yreview.tasks.CheckState
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TaskLabels
import javax.swing.tree.DefaultMutableTreeNode

/** The check box of a row outside the project is off and says why. JUnit 3 finds a test by the prefix test. */
class TaskCheckRendererTest : BasePlatformTestCase() {

    private fun task(outside: Boolean) = ReviewTask(
        id = "a",
        kind = TaskKind.COMMENT,
        path = "a.txt",
        startLine = 1,
        endLine = 1,
        text = "look at this",
        filePath = "/loose/a.txt",
        rootPath = "/loose",
        outside = outside,
    )

    private fun render(task: ReviewTask): Pair<ThreeStateCheckBox, String?> {
        val renderer = TaskCheckRenderer { CheckState.NONE }
        val node = TaskNode(project, task).apply { update() }
        renderer.getTreeCellRendererComponent(Tree(), DefaultMutableTreeNode(node), false, false, true, 0, false)
        return renderer.components.filterIsInstance<ThreeStateCheckBox>().single() to renderer.toolTipText
    }

    fun testAnOutsideTaskRowHasADisabledCheckBoxWithTheReason() {
        val (box, tooltip) = render(task(outside = true))

        assertTrue(box.isVisible)
        assertFalse(box.isEnabled)
        assertTrue(tooltip.orEmpty(), tooltip.orEmpty().contains(TaskLabels.OUTSIDE_CHECK))
        assertEquals("The agent works in the project folder, so it does not take this task.", TaskLabels.OUTSIDE_CHECK)
    }

    fun testAProjectTaskRowKeepsAnEnabledCheckBox() {
        val (box, tooltip) = render(task(outside = false))

        assertTrue(box.isEnabled)
        assertFalse(tooltip.orEmpty().contains(TaskLabels.OUTSIDE_CHECK))
    }
}
