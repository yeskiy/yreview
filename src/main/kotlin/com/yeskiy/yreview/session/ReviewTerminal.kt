package com.yeskiy.yreview.session

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.terminal.frontend.toolwindow.TerminalToolWindowTab
import com.intellij.terminal.frontend.toolwindow.TerminalToolWindowTabsManager
import com.intellij.terminal.frontend.view.TerminalView
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManager
import org.jetbrains.plugins.terminal.TerminalToolWindowFactory
import org.jetbrains.plugins.terminal.startup.TerminalProcessType

/**
 * One review session. It holds the view of the terminal and the content manager that
 * carries the tab.
 *
 * The manager owns the content, and the content owns the session. One dispose of the
 * manager therefore ends the session and the process behind it.
 */
class ReviewSession internal constructor(
    val view: TerminalView,
    private val contents: ContentManager
) {

    /**
     * Ends the session and the process. The terminal keeps its editors while the component
     * is on screen, so the last output stays readable. A second call does nothing.
     */
    fun close() = Disposer.dispose(contents)
}

/**
 * Starts one terminal tab for a review session.
 *
 * The tab runs on the reworked engine, the terminal engine of the bundled Terminal tool
 * window. That engine lifts every ANSI color to a contrast ratio of 4.5 to 1 against the
 * background, and it paints the block cursor in a color of its own.
 *
 * The tab goes into a content manager of the plugin, not into the Terminal tool window.
 * The caller adds the component of the view to a panel of its own, and the caller ends the
 * session with [ReviewSession.close].
 */
object ReviewTerminal {

    /**
     * Runs on the user interface thread, because the tab builder asks for that thread.
     * Returns null after any failure, and the log holds the reason.
     *
     * The tab builder reads the Terminal tool window before it adds the tab, so this call
     * looks for that window first. A session that starts without the window would leave a
     * process behind the failure.
     *
     * The process type is not a shell. The plugin owns every argument of the command line,
     * so the terminal must not add a shell integration argument of its own.
     *
     * The session start waits for the first paint of the component. The terminal grid then
     * matches the panel, and no output moves into the history buffer.
     */
    fun open(project: Project, plan: SessionPlan): ReviewSession? = runCatching {
        checkNotNull(ToolWindowManager.getInstance(project).getToolWindow(TerminalToolWindowFactory.TOOL_WINDOW_ID)) {
            "This IDE registers no Terminal tool window, so a review session cannot start."
        }
        val contents = ContentFactory.getInstance().createContentManager(false, project)
        try {
            ReviewSession(tab(project, plan, contents).view, contents)
        } catch (failure: Throwable) {
            Disposer.dispose(contents)
            throw failure
        }
    }.onFailure { thisLogger().warn("The review session terminal did not start.", it) }.getOrNull()

    /**
     * A tab with a content manager of its own stays out of the Terminal tool window, and
     * a tab that asks for no focus leaves that window in the background.
     */
    private fun tab(project: Project, plan: SessionPlan, contents: ContentManager): TerminalToolWindowTab =
        TerminalToolWindowTabsManager.getInstance(project).createTabBuilder()
            .workingDirectory(plan.workingDirectory)
            .shellCommand(plan.command)
            .envVariables(plan.environment)
            .processType(TerminalProcessType.NON_SHELL)
            .tabName(TAB_NAME)
            .deferSessionStartUntilUiShown(true)
            .closeOnProcessTermination(false)
            .contentManager(contents)
            .requestFocus(false)
            .createTab()

    private const val TAB_NAME = "Claude Review"
}
