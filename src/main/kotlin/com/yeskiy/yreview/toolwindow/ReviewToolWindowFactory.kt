package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class ReviewToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = CommentListPanel(project)
        Disposer.register(toolWindow.disposable, panel)
        toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(panel, "", false))
    }
}
