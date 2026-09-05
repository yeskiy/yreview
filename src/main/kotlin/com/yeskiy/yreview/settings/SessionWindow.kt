package com.yeskiy.yreview.settings

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager

/**
 * The session tool window, as the settings page and the descriptor both name it.
 *
 * The platform reads ToolWindowFactory.shouldBeAvailable once, while the project opens,
 * and it registers the window whatever that answer is. A later change of the switch
 * therefore goes straight to the window, and the user needs no restart.
 */
object SessionWindow {

    /** The identifier in y-review-terminal.xml. The saved layout of the user keeps it. */
    const val ID = "Yreview Session"

    /**
     * Shows or hides the window now. The platform accepts the change on the user interface
     * thread only, and a project without the terminal plugin holds no such window.
     */
    fun show(project: Project, shown: Boolean) {
        val manager = ToolWindowManager.getInstance(project)
        manager.invokeLater { manager.getToolWindow(ID)?.isAvailable = shown }
    }
}
