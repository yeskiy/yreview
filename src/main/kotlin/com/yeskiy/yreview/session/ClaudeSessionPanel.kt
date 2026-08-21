package com.yeskiy.yreview.session

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.terminal.ui.TerminalWidget
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.JTextArea

/**
 * The content of the Claude Review tool window. It holds a terminal that runs one review
 * session. The plugin owns the command line, so the channel flags are never missing.
 */
class ClaudeSessionPanel(private val project: Project) : JPanel(BorderLayout()), Disposable {

    private val idle = JBPanelWithEmptyText()
    private val status = statusArea()
    private var widget: TerminalWidget? = null
    private var running = false

    init {
        idle.emptyText
            .setText("No review session is running.")
            .appendLine("Press Start Claude Review to open a session with the comment channel.")

        val toolbar = ActionManager.getInstance()
            .createActionToolbar("YReviewSession", DefaultActionGroup(StartAction()), true)
        toolbar.targetComponent = this
        add(toolbar.component, BorderLayout.NORTH)
        add(idle, BorderLayout.CENTER)
        add(status, BorderLayout.SOUTH)
        status.text = bridgeState()
    }

    override fun dispose() = Unit

    val isRunning: Boolean
        get() = running

    fun start() {
        if (running) return
        val basePath = project.basePath
        if (basePath == null) {
            status.text = NO_DIRECTORY
            return
        }
        val plan = SessionPlan.of(basePath, BridgeDiscovery.find(basePath))
        val started = ReviewTerminal.open(project, plan, this)
        if (started == null) {
            status.text = "The terminal did not start. The IDE log holds the reason."
            return
        }
        widget?.let {
            remove(it.component)
            Disposer.dispose(it)
        }
        widget = started
        running = true
        started.addTerminationCallback(Runnable { onSessionEnd() }, this)
        remove(idle)
        add(started.component, BorderLayout.CENTER)
        status.text = plan.status
        revalidate()
        repaint()
        started.requestFocus()
    }

    private fun onSessionEnd() = ApplicationManager.getApplication().invokeLater {
        running = false
        status.text = "The review session ended. Press Start Claude Review to open a new one."
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

    private companion object {
        const val NO_DIRECTORY = "This project has no directory, so a session cannot start here."
    }
}
