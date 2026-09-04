package com.yeskiy.yreview.session

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
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
     * interface thread. The window now carries the agent selector, so it appears unless
     * the user cleared the switch. The search for the installed agents starts here and
     * nothing waits for it, so the project opens at the same speed as before.
     */
    override fun shouldBeAvailable(project: Project): Boolean {
        AgentScan.getInstance().refresh()
        return ReviewSettings.getInstance(project).sessionWindowShown()
    }

    /**
     * The platform builds the content once for the project, on the user interface thread.
     * It waits until the user first opens the window. If the saved layout of the user
     * holds this window open, the platform builds the content while the project opens.
     *
     * The first tab of the window opens here, so the user presses no button for it. Every
     * later tab comes from the plus button in the title bar. The title bar holds the
     * actions of the window, not of one tab, so they survive a close of every tab.
     */
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val tabs = SessionTabs(project, toolWindow)
        Disposer.register(toolWindow.disposable, tabs)
        toolWindow.setTitleActions(tabs.titleActions())
        tabs.open(start = ReviewSettings.getInstance(project).autoStartSession)
    }

    private companion object {
        const val STRIPE_TITLE = "Claude"
    }
}
