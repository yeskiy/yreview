package com.yeskiy.yreview.session

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.terminal.JBTerminalWidget
import com.intellij.terminal.ui.TerminalWidget
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.util.ui.JBUI
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings
import org.jetbrains.plugins.terminal.ShellTerminalWidget
import java.awt.BorderLayout
import java.nio.file.Path
import javax.swing.JPanel
import javax.swing.JTextArea

/**
 * The content of the Claude tool window. It holds a terminal that runs one review session.
 * The plugin owns the command line. It reads the command from the settings, and it appends
 * the channel flags itself, so no shell function of one machine has to carry them.
 *
 * One button in the tool window title bar carries both states. It starts a session while
 * none runs, and it ends the running one. A terminal stays on screen after the session
 * ends, and the last output stays readable. The title of the tool window carries the
 * state. A new start drops the dead terminal and mounts a new one. The empty state with
 * the bridge status shows before the first session of the project only.
 *
 * The state follows the process behind the terminal, not the terminal widget. Two signals
 * report the end, and each one alone is enough. The first signal is the exit of the
 * process. The second signal is the termination callback of the widget.
 */
class ClaudeSessionPanel(
    private val project: Project,
    private val toolWindow: ToolWindow
) : JPanel(BorderLayout()), Disposable {

    private val status = statusArea()
    private val idle = JBPanelWithEmptyText(BorderLayout()).apply { add(status, BorderLayout.SOUTH) }

    /** The widget on screen. It stays after the session ends, because the output stays. */
    private var terminal: TerminalWidget? = null

    /** The widget of the running session. It becomes null the moment the session ends. */
    private var session: TerminalWidget? = null

    /** True between the press on Start and the mount of the terminal. */
    private var starting = false

    /** The configuration file of the running session. It goes away with the session. */
    private var configFile: Path? = null

    init {
        showIdle(NO_SESSION, AUTO_START)
    }

    override fun dispose() = dropConfig()

    val isRunning: Boolean
        get() = session != null

    fun titleActions(): List<AnAction> = listOf(SessionAction())

    /**
     * The tool window opens the first session through this method, because a fresh panel
     * can hold no size yet. The terminal runner reads the size of its component, so a
     * session that starts too early gets 80 columns by 24 rows.
     */
    fun startWhenSized() = SizeGate.run(this) { start() }

    /**
     * The window factory reaches this through [startWhenSized]. The title bar button calls
     * it for every later session, and it calls it whatever the size is, because the user
     * looks at a window that is on screen.
     *
     * The bridge opens a port and writes a file, so the wait for it stays off this thread.
     * The terminal mounts on this thread again, after the bridge answers or after the wait
     * ends. A second press during the wait does nothing.
     */
    fun start() {
        if (isRunning || starting) return
        val basePath = project.basePath ?: return failed(NO_SESSION)
        starting = true
        toolWindow.setTitle(STARTING_TITLE)
        if (terminal == null) status.text = BRIDGE_WAIT
        ApplicationManager.getApplication().executeOnPooledThread {
            val bridge = awaitBridge(basePath)
            ApplicationManager.getApplication().invokeLater({ mount(basePath, bridge) }, project.disposed)
        }
    }

    /**
     * The startup activity of the project opens the bridge. A tool window can open before
     * that activity ends, so the session starts the bridge again and waits a short time for
     * the file. A second start returns the address of the first one.
     */
    private fun awaitBridge(basePath: String): BridgeLookup {
        val found = lookup(basePath)
        if (found !is BridgeLookup.Unavailable) return found
        if (BridgeService.getInstance(project).start() == null) return found
        return BridgeWait.poll(probe = { BridgeDiscovery.find(basePath) })
    }

    /** The switch comes first, so a closed channel never reads the file of an earlier run. */
    private fun lookup(basePath: String): BridgeLookup =
        if (settings().channel) {
            BridgeDiscovery.find(basePath)
        } else {
            BridgeLookup.ChannelOff
        }

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)

    private fun channelServer(): ChannelServer.Answer = ChannelServer.locate()

    private fun javaPath(): String? = JavaRuntime.locate()

    /**
     * The channel needs all three parts, so the file appears only when the bridge answers,
     * the plugin holds the server, and the IDE names a Java runtime. A failed write leaves
     * the session without the channel.
     */
    private fun writeConfig(bridge: BridgeLookup, server: ChannelServer.Answer, javaPath: String?): Path? {
        if (bridge !is BridgeLookup.Available || server !is ChannelServer.Answer.Found) return null
        javaPath ?: return null
        return runCatching { ChannelConfig.write(javaPath, server.path) }
            .onFailure { thisLogger().warn("The review session wrote no channel configuration file.", it) }
            .getOrNull()
    }

    private fun dropConfig() {
        ChannelConfig.delete(configFile)
        configFile = null
    }

    private fun mount(basePath: String, bridge: BridgeLookup) {
        starting = false
        if (isRunning) return
        dropConfig()
        val server = channelServer()
        val javaPath = javaPath()
        val written = writeConfig(bridge, server, javaPath)
        configFile = written
        val plan = SessionPlan.of(basePath, bridge, settings().claudeCommand, server, javaPath, written?.toString())
        val started = ReviewTerminal.open(project, plan, this)
        if (started == null) {
            dropConfig()
            return failed(NO_TERMINAL)
        }
        terminal?.let { drop(it) }
        remove(idle)
        terminal = started
        session = started
        started.addTerminationCallback(Runnable { onTermination(started) }, jediTerm(started) ?: this)
        watch(started)
        add(started.component, BorderLayout.CENTER)
        toolWindow.setTitle(RUNNING_TITLE)
        // The layout runs now, and not on the next pass of the event queue. The terminal
        // runner waits two seconds for a real size, then it falls back to 80 by 24. A
        // session that starts larger than the window pushes its first lines into the
        // history buffer, and the scroll bar of the terminal appears.
        validate()
        repaint()
        started.requestFocus()
    }

    /**
     * Follows the process behind the terminal. The terminal gets its connector after the
     * session opens, so the accessor holds this call until the connector exists. The
     * wrapper shell carries no flag that keeps it alive, so it exits with the agent. The
     * exit callback runs on a pooled thread, and [onTermination] moves the work to the
     * user interface thread.
     */
    private fun watch(started: TerminalWidget) =
        started.ttyConnectorAccessor.executeWithTtyConnector { connector ->
            ShellTerminalWidget.getProcessTtyConnector(connector)?.process?.let { process ->
                thisLogger().info("The review session runs under process ${process.pid()}.")
                process.onExit().thenRun { onTermination(started) }
            }
        }

    /**
     * The connector close reaches the destroy call of the process. The widget stays alive,
     * so the last output of the session stays on screen. A second press does nothing.
     */
    fun stop() {
        val live = session ?: return
        jediTerm(live)?.ttyConnector?.close()
        endSession()
    }

    /**
     * Both signals of the end arrive here, and neither one runs on the user interface
     * thread. The first signal ends the session. A later signal finds no session of
     * [ended], and it changes nothing. A new start can also outrun a late signal.
     */
    private fun onTermination(ended: TerminalWidget) = ApplicationManager.getApplication().invokeLater {
        if (session === ended) endSession()
    }

    private fun endSession() {
        session = null
        dropConfig()
        toolWindow.setTitle(ENDED_TITLE)
    }

    /**
     * The widget close stops the emulator and the terminal panel. The connector close makes
     * sure that the operating system process is gone.
     */
    private fun drop(widget: TerminalWidget) {
        remove(widget.component)
        val jedi = jediTerm(widget) ?: return
        Disposer.dispose(jedi)
        jedi.ttyConnector?.close()
    }

    /** The widget of the terminal, not the bridge in front of it. The bridge closes nothing. */
    private fun jediTerm(widget: TerminalWidget): JBTerminalWidget? =
        JBTerminalWidget.asJediTermWidget(widget)

    private fun failed(headline: String) {
        starting = false
        toolWindow.setTitle(NOT_STARTED_TITLE)
        if (terminal == null) showIdle(headline, PRESS_START)
    }

    private fun showIdle(headline: String, hint: String) {
        idle.emptyText.setText(headline).appendLine(hint)
        status.text = bridgeState()
        add(idle, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    private fun bridgeState(): String {
        val basePath = project.basePath ?: return NO_DIRECTORY
        return SessionPlan.of(basePath, lookup(basePath), settings().claudeCommand, channelServer(), javaPath()).status
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

    /**
     * One button for both states. The update thread stays the user interface thread,
     * because the state of the session lives there and no data call reads it.
     */
    private inner class SessionAction : AnAction() {

        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            val live = isRunning
            event.presentation.text = if (live) STOP_TEXT else START_TEXT
            event.presentation.description = if (live) STOP_HINT else START_HINT
            event.presentation.icon = if (live) AllIcons.Actions.Suspend else AllIcons.Actions.Execute
        }

        override fun actionPerformed(event: AnActionEvent) = if (isRunning) stop() else start()
    }

    private companion object {
        const val RUNNING_TITLE = "Running"
        const val ENDED_TITLE = "Ended"
        const val NOT_STARTED_TITLE = "Not started"
        const val STARTING_TITLE = "Starting"
        const val NO_SESSION = "No review session runs."
        const val NO_TERMINAL = "The terminal did not start. The IDE log holds the reason."
        const val NO_DIRECTORY = "This project has no directory, so a session cannot start here."
        const val PRESS_START = "Press Start in the title bar to open a session with the comment channel."
        const val AUTO_START = "The session opens by itself with the comment channel."
        const val BRIDGE_WAIT = "The review bridge starts now. The session opens after the bridge answers."
        const val START_TEXT = "Start Claude"
        const val START_HINT = "Start a review session with the IDE server and the comment channel."
        const val STOP_TEXT = "Stop Claude"
        const val STOP_HINT = "End the review session and the process behind it."
    }
}
