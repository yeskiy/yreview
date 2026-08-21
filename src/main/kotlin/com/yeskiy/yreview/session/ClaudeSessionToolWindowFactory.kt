package com.yeskiy.yreview.session

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.yeskiy.yreview.settings.ReviewSettings

class ClaudeSessionToolWindowFactory : ToolWindowFactory {

    /**
     * The stripe shows this name. The identifier of the tool window stays as it is, so the
     * saved layout of the user survives the new name.
     */
    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = STRIPE_TITLE
    }

    /**
     * The platform asks once, while the project opens, and it asks away from the user
     * interface thread. The search for a Claude installation therefore runs here, and it
     * keeps its answer for the whole application.
     *
     * The window stays registered whatever this answer is, so the settings page can show
     * it again without a restart.
     */
    override fun shouldBeAvailable(project: Project): Boolean =
        ReviewSettings.getInstance(project).sessionWindowShown(ClaudeDetection.getInstance().install().found)

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
