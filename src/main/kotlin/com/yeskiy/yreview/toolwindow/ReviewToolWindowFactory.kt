package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.yeskiy.yreview.tasks.TaskScope

/**
 * Builds the tab strip of the review tool window, one tab per scope.
 *
 * The built-in TODO window puts the same strip above its tree, and every tab there is a
 * content of the tool window. A tab of the review window holds one panel, and that panel
 * reads only the tasks of its own scope.
 *
 * The window opens while the IDE builds the index, as the bundled TODO window does. A
 * scan of the tasks waits for the index, and each tab names that wait on its empty tree.
 */
class ReviewToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        TaskScope.entries.forEach { scope ->
            val panel = ReviewTreePanel(project, scope)
            Disposer.register(toolWindow.disposable, panel)
            val content = ContentFactory.getInstance().createContent(panel, scope.title, false).apply {
                isCloseable = false
                description = scope.summary
            }
            panel.attach(content)
            toolWindow.contentManager.addContent(content)
        }
    }
}
