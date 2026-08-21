package com.yeskiy.yreview.session

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.terminal.JBTerminalWidget
import com.intellij.terminal.ui.TerminalWidget
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.JTextArea

/**
 * The content of the Claude Review tool window. It holds a terminal that runs one review
 * session. The plugin owns the command line, so the channel flags are never missing.
 *
 * The buttons live in the tool window title bar, so a terminal gets the whole content area.
 * A terminal stays on screen after the session ends, and the last output stays readable.
 * The title of the tool window carries the state. Start and Restart drop the dead terminal
 * and mount a new one. The empty state with the bridge status shows before the first
 * session of the project only.
 */
class ClaudeSessionPanel(
    private val project: Project,
    private val toolWindow: ToolWindow
) : JPanel(BorderLayout()), Disposable {

    private val status = statusArea()
    private val idle = JBPanelWithEmptyText(BorderLayout()).apply { add(status, BorderLayout.SOUTH) }
    private var terminal: TerminalWidget? = null
    private var running = false

    init {
        showIdle(NO_SESSION)
    }

    override fun dispose() = Unit

    val isRunning: Boolean
        get() = running

    fun titleActions(): List<AnAction> = listOf(StartAction(), StopAction(), RestartAction())

    fun start() {
        if (running) return
        val basePath = project.basePath ?: return failed(NO_SESSION)
        val started = ReviewTerminal.open(project, SessionPlan.of(basePath, BridgeDiscovery.find(basePath)), this)
            ?: return failed(NO_TERMINAL)
        terminal?.let { drop(it) }
        remove(idle)
        terminal = started
        running = true
        started.addTerminationCallback(Runnable { onTermination(started) }, jediTerm(started) ?: this)
        add(started.component, BorderLayout.CENTER)
        toolWindow.setTitle(RUNNING_TITLE)
        revalidate()
        repaint()
        started.requestFocus()
    }

    /**
     * The connector close reaches the destroy call of the process. The widget stays alive,
     * so the last output of the session stays on screen.
     */
    fun stop() {
        if (!running) return
        terminal?.let { jediTerm(it)?.ttyConnector?.close() }
        endSession()
    }

    fun restart() {
        stop()
        start()
    }

    /** The callback runs on the emulator thread, and a restart can outrun it. */
    private fun onTermination(ended: TerminalWidget) = ApplicationManager.getApplication().invokeLater {
        if (terminal === ended) endSession()
    }

    private fun endSession() {
        running = false
        toolWindow.setTitle(ENDED_TITLE)
    }

    /**
     * The widget close stops the emulator and the terminal panel. The connector close makes
     * sure that the operating system process is gone.
     */
    private fun drop(session: TerminalWidget) {
        remove(session.component)
        val widget = jediTerm(session) ?: return
        Disposer.dispose(widget)
        widget.ttyConnector?.close()
    }

    /** The widget of the terminal, not the bridge in front of it. The bridge closes nothing. */
    private fun jediTerm(session: TerminalWidget): JBTerminalWidget? =
        JBTerminalWidget.asJediTermWidget(session)

    private fun failed(headline: String) {
        toolWindow.setTitle(NOT_STARTED_TITLE)
        if (terminal == null) showIdle(headline)
    }

    private fun showIdle(headline: String) {
        idle.emptyText.setText(headline).appendLine(START_HINT)
        status.text = bridgeState()
        add(idle, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    private fun bridgeState(): String {
        val basePath = project.basePath ?: return NO_DIRECTORY
        return SessionPlan.of(basePath, BridgeDiscovery.find(basePath)).status
    }

    /** A text area, not a label. The status text wraps, and it never renders markup. */
    private fun statusArea() = JTextArea().apply {
        isEditable = false
        isOpaque = false
        isFocusable = false
        lineWrap = true
        wrapStyleWord = true
        font = JBUI.Fonts.label()
        border = JBUI.Borders.empty(4, 8)
    }

    private inner class StartAction : AnAction(
        "Start Claude Review",
        "Start a review session with the IDE server and the comment channel.",
        AllIcons.Actions.Execute
    ) {
        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = !running
        }

        override fun actionPerformed(event: AnActionEvent) = start()
    }

    private inner class StopAction : AnAction(
        "Stop Claude Review",
        "End the review session and the process behind it.",
        AllIcons.Actions.Suspend
    ) {
        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = running
        }

        override fun actionPerformed(event: AnActionEvent) = stop()
    }

    private inner class RestartAction : AnAction(
        "Restart Claude Review",
        "End the review session, then start a new one.",
        AllIcons.Actions.Restart
    ) {
        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun actionPerformed(event: AnActionEvent) = restart()
    }

    private companion object {
        const val RUNNING_TITLE = "Running"
        const val ENDED_TITLE = "Ended"
        const val NOT_STARTED_TITLE = "Not started"
        const val NO_SESSION = "No review session runs."
        const val NO_TERMINAL = "The terminal did not start. The IDE log holds the reason."
        const val NO_DIRECTORY = "This project has no directory, so a session cannot start here."
        const val START_HINT = "Press Start in the title bar to open a session with the comment channel."
    }
}
