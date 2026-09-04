package com.yeskiy.yreview.session

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener

/** One tab of the window. The number names it, and the panel runs the session behind it. */
private class SessionTab(val number: Int, val panel: ClaudeSessionPanel, val content: Content)

/**
 * Holds every review session of one project. One tab runs one session.
 *
 * The plus button in the title bar opens a tab, and the session of that tab starts by
 * itself. A close of the tab ends that session and the process behind it, because the
 * content carries the panel as its disposer, and the platform disposes a content when it
 * leaves the window.
 *
 * The second title bar button reads the tab the user looks at. It starts the session of
 * that tab while none runs, and it ends the running one. A session that ends keeps its tab
 * and its output, so the user reads the last lines and starts again in the same tab.
 *
 * Every method here runs on the user interface thread. The list of tabs lives on that
 * thread, and no other thread reads it.
 */
class SessionTabs(
    private val project: Project,
    private val toolWindow: ToolWindow,
) : Disposable {

    private val tabs = mutableListOf<SessionTab>()

    init {
        toolWindow.contentManager.addContentManagerListener(object : ContentManagerListener {
            override fun contentRemoved(event: ContentManagerEvent) {
                tabs.removeAll { it.content === event.content }
            }
        })
    }

    /**
     * The project closes, so every session that still runs ends here. A panel that a tab
     * already disposed ends nothing a second time, because the close of a session and the
     * delete of the configuration file both run once.
     */
    override fun dispose() {
        tabs.toList().forEach { it.panel.dispose() }
        tabs.clear()
    }

    fun titleActions(): List<AnAction> = listOf(NewSessionAction(), StateAction())

    /**
     * Opens one tab, and starts the session in it while [start] is true.
     *
     * The window opens the first tab with the switch of the settings page. The plus button
     * opens every later tab with a start, because a user who presses plus asked for one.
     *
     * The panel reaches the window before the session starts. A panel that no parent laid
     * out holds no size, the terminal reads that size, and a terminal of 80 columns by 24
     * rows shows a scroll bar over output that fits. The size gate therefore waits for the
     * first real size, and it runs at once when the panel already holds one.
     */
    fun open(start: Boolean = true) {
        if (!SessionRules.canOpen(tabs.size)) return
        val number = SessionRules.freeNumber(tabs.map { it.number }.toSet())
        val panel = ClaudeSessionPanel(project, SessionRules.name(number), start) { state -> rename(number, state) }
        val content = ContentFactory.getInstance()
            .createContent(panel, SessionRules.label(number, SessionState.NOT_STARTED), false)
        content.isCloseable = true
        content.setDisposer(panel)
        tabs += SessionTab(number, panel, content)
        toolWindow.contentManager.addContent(content)
        toolWindow.contentManager.setSelectedContent(content)
        if (start) panel.startWhenSized()
    }

    /** A report that finds no tab changes nothing, so a late report of a closed tab is safe. */
    private fun rename(number: Int, state: SessionState) {
        tabs.firstOrNull { it.number == number }?.content?.displayName = SessionRules.label(number, state)
    }

    private fun selected(): ClaudeSessionPanel? {
        val chosen = toolWindow.contentManager.selectedContent ?: return null
        return tabs.firstOrNull { it.content === chosen }?.panel
    }

    /**
     * Opens one more session. The bridge serves a fixed number of event streams, and a
     * session over that number would read no comment, so the button stops there.
     */
    private inner class NewSessionAction : AnAction() {

        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            val room = SessionRules.canOpen(tabs.size)
            event.presentation.text = NEW_TEXT
            event.presentation.description = if (room) NEW_HINT else FULL_HINT
            event.presentation.icon = AllIcons.General.Add
            event.presentation.isEnabled = room
        }

        override fun actionPerformed(event: AnActionEvent) = open()
    }

    /**
     * One button for both states of the tab the user looks at. The update thread stays the
     * user interface thread, because the state of a session lives there and no data call
     * reads it.
     */
    private inner class StateAction : AnAction() {

        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            val panel = selected()
            val live = panel?.isRunning == true
            event.presentation.text = if (live) STOP_TEXT else START_TEXT
            event.presentation.description = if (live) STOP_HINT else START_HINT
            event.presentation.icon = if (live) AllIcons.Actions.Suspend else AllIcons.Actions.Execute
            event.presentation.isEnabled = panel != null
        }

        override fun actionPerformed(event: AnActionEvent) {
            val panel = selected() ?: return
            if (panel.isRunning) panel.stop() else panel.start()
        }
    }

    private companion object {
        const val NEW_TEXT = "New Claude Session"
        const val NEW_HINT = "Open one more review session in a tab of its own."
        const val FULL_HINT = "The review bridge serves ${SessionRules.MAX_SESSIONS} sessions at once."
        const val START_TEXT = "Start Claude"
        const val START_HINT = "Start a review session with the IDE server and the comment channel."
        const val STOP_TEXT = "Stop Claude"
        const val STOP_HINT = "End the review session and the process behind it."
    }
}
