package com.yeskiy.yreview.toolwindow

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
 */
class ReviewToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        TaskScope.entries.forEach { scope ->
            val panel = ReviewTreePanel(project, scope)
            Disposer.register(toolWindow.disposable, panel)
            toolWindow.contentManager.addContent(
                ContentFactory.getInstance().createContent(panel, scope.title, false).apply {
                    isCloseable = false
                    description = scope.summary
                }
            )
        }
    }
}
