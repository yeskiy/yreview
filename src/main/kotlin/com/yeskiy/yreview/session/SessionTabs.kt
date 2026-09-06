package com.yeskiy.yreview.session

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ex.TooltipDescriptionProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import com.yeskiy.yreview.settings.ReviewSettings

/** One tab of the window. The number names it, and the panel runs the session behind it. */
private class SessionTab(val number: Int, val panel: SessionPanel, val content: Content) {

    /** What the session behind this tab does now. The tab text carries it. */
    var state: SessionState = SessionState.NOT_STARTED

    /** The last stable name this tab wrote. A repeat write of one name changes nothing. */
    var shown: String? = null

    /** The name that the user typed for this tab, or null while the user typed none. */
    var byUser: String? = null
}

/**
 * Holds every review session of one project. One tab runs one session.
 *
 * The plus button in the title bar opens a tab, and the session of that tab starts by
 * itself. A close of the tab ends that session and the process behind it, because the
 * content carries the panel as its disposer, and the platform disposes a content when it
 * leaves the window.
 *
 * A close of the last tab opens one tab again. The platform builds the content of a window
 * once, so a window that loses every tab would stay empty for the life of the project. The
 * new tab starts nothing, because the user just ended a session, and its empty screen names
 * the button that starts the next one.
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

    /** True after the project closed this window. Every later close then opens no tab. */
    private var closing = false

    init {
        toolWindow.contentManager.addContentManagerListener(object : ContentManagerListener {
            override fun contentRemoved(event: ContentManagerEvent) {
                tabs.removeAll { it.content === event.content }
                if (!closing && tabs.isEmpty()) open(start = false)
            }
        })
        project.messageBus.connect(this).subscribe(SESSION_NAMES, SessionNameListener { refreshAll() })
    }

    /**
     * The project closes, so every session that still runs ends here. A panel that a tab
     * already disposed ends nothing a second time, because the close of a session runs
     * once.
     */
    override fun dispose() {
        closing = true
        tabs.toList().forEach { it.panel.dispose() }
        tabs.clear()
    }

    /**
     * The buttons of the title bar, in the order the bar shows them.
     *
     * A title bar button paints the description of its presentation for an action of this
     * kind only, and it paints that line for a button that is off as well. An action that
     * carries no such kind shows the text of the button and nothing more.
     */
    fun titleActions(): List<AnAction> = listOf(NewSessionAction(), RenameAction(), StateAction())

    /**
     * Opens one tab, and starts the session in it while [start] is true.
     *
     * The window opens the first tab with the switch of the settings page. The plus button
     * opens every later tab with a start, because a user who presses plus asked for one. The
     * tab that follows a close of the last tab starts nothing.
     *
     * The panel reaches the window before the session starts. A panel that no parent laid
     * out holds no size, the terminal reads that size, and a terminal of 80 columns by 24
     * rows shows a scroll bar over output that fits. The size gate therefore waits for the
     * first real size, and it runs at once when the panel already holds one.
     */
    fun open(start: Boolean = true) {
        if (!SessionRules.canOpen(tabs.size)) return
        val number = SessionRules.freeNumber(tabs.map { it.number }.toSet())
        val panel = SessionPanel(project, number, start) { state -> onState(number, state) }
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        content.isCloseable = true
        content.setDisposer(panel)
        val tab = SessionTab(number, panel, content)
        tabs += tab
        refresh(tab)
        toolWindow.contentManager.addContent(content)
        toolWindow.contentManager.setSelectedContent(content)
        if (start) panel.startWhenSized()
    }

    /** A report that finds no tab changes nothing, so a late report of a closed tab is safe. */
    private fun onState(number: Int, state: SessionState) {
        val tab = tabs.firstOrNull { it.number == number } ?: return
        tab.state = state
        refresh(tab)
    }

    /** Everything that names one tab, read from the tab and from the panel behind it. */
    private fun facts(tab: SessionTab): TabFacts = TabFacts(
        tab.number,
        tab.panel.tabAgent?.short,
        tab.state,
        byAgent = tab.panel.agentName,
        byUser = tab.byUser,
    )

    /**
     * Writes the name of one tab. The platform fires a change event on every write, so a
     * write of the same name is skipped.
     */
    private fun refresh(tab: SessionTab) {
        val facts = facts(tab)
        val stable = SessionRules.name(facts)
        val label = SessionRules.label(facts)
        if (tab.content.displayName != label) tab.content.displayName = label
        tab.content.description = SessionRules.tooltip(facts)
        if (tab.shown == stable) return
        tab.shown = stable
        SessionRegistry.getInstance(project).rename(tab.panel.sessionKey, stable)
    }

    /** Every tab reads its name again. A tab whose name did not change writes nothing. */
    private fun refreshAll() = tabs.toList().forEach { refresh(it) }

    private fun selectedTab(): SessionTab? {
        val chosen = toolWindow.contentManager.selectedContent ?: return null
        return tabs.firstOrNull { it.content === chosen }
    }

    private fun selected(): SessionPanel? = selectedTab()?.panel

    /**
     * Opens one more session. The bridge serves a fixed number of event streams, and a
     * session over that number would read no comment, so the button stops there.
     */
    private inner class NewSessionAction : AnAction(), DumbAware, TooltipDescriptionProvider {

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
     * Names the tab that the user looks at.
     *
     * The action stands in the title bar and never in a tab menu, because the platform
     * builds the menu of a content tab itself. It is off for an agent that names its own
     * sessions, and the reason then stands in the hint of the button.
     */
    private inner class RenameAction : AnAction(), DumbAware, TooltipDescriptionProvider {

        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            val tab = selectedTab()
            val blocked = SessionNaming.blocked(tab?.panel?.tabAgent)
            event.presentation.text = SessionNaming.ACTION_TEXT
            event.presentation.description = blocked ?: SessionNaming.HINT
            event.presentation.icon = AllIcons.Actions.Edit
            event.presentation.isEnabled = tab != null && blocked == null
        }

        override fun actionPerformed(event: AnActionEvent) {
            val tab = selectedTab() ?: return
            if (SessionNaming.blocked(tab.panel.tabAgent) != null) return
            val answer = Messages.showInputDialog(
                project,
                SessionNaming.PROMPT,
                SessionNaming.TITLE,
                Messages.getQuestionIcon(),
                tab.byUser.orEmpty(),
                null,
            ) ?: return
            tab.byUser = SessionNaming.clean(answer)
            refresh(tab)
        }
    }

    /**
     * One button for both states of the tab the user looks at. The update thread stays the
     * user interface thread, because the state of a session lives there and no data call
     * reads it.
     */
    private inner class StateAction : AnAction(), DumbAware, TooltipDescriptionProvider {

        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            val panel = selected()
            val live = panel?.isRunning == true
            event.presentation.text = if (live) "Stop ${agentName(panel)}" else "Start ${agentName(panel)}"
            event.presentation.description = if (live) STOP_HINT else START_HINT
            event.presentation.icon = if (live) AllIcons.Actions.Suspend else AllIcons.Actions.Execute
            event.presentation.isEnabled = panel != null && (live || panel.startable)
            event.presentation.isVisible = live || panel?.startable == true
        }

        /**
         * A running session keeps the agent it started with, so the button of that tab
         * names that agent and not the newer choice of the settings page.
         */
        private fun agentName(panel: SessionPanel?): String = AgentRows.buttonName(
            panel?.runningAgent ?: AgentCatalog.of(ReviewSettings.getInstance(project).agentOrDefault())
        )

        override fun actionPerformed(event: AnActionEvent) {
            val panel = selected() ?: return
            if (panel.isRunning) panel.stop() else panel.start()
        }
    }

    private companion object {
        const val NEW_TEXT = "New Review Session"
        const val NEW_HINT = "Open one more review session in a tab of its own."
        const val FULL_HINT = "The review bridge serves ${SessionRules.MAX_SESSIONS} sessions at once."
        const val START_HINT = "Start a review session with the IDE server and the comment channel."
        const val STOP_HINT = "End the review session and the process behind it."
    }
}
