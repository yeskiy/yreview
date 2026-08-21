package com.yeskiy.yreview.session

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class ClaudeSessionToolWindowFactory : ToolWindowFactory {

    /**
     * The stripe shows this name. The identifier of the tool window stays as it is, so the
     * saved layout of the user survives the new name.
     */
    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = STRIPE_TITLE
    }

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = ClaudeSessionPanel(project, toolWindow)
        Disposer.register(toolWindow.disposable, panel)
        toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(panel, "", false))
        toolWindow.setTitleActions(panel.titleActions())
    }

    private companion object {
        const val STRIPE_TITLE = "Claude"
    }
}
