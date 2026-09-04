package com.yeskiy.yreview.session

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.terminal.frontend.view.TerminalViewSessionState
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.util.ui.JBUI
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.bridge.SessionKey
import com.yeskiy.yreview.diagnostic.SessionLog
import com.yeskiy.yreview.diagnostic.SessionRecord
import com.yeskiy.yreview.settings.ReviewSettings
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.nio.file.Path
import javax.swing.JPanel
import javax.swing.JTextArea

/**
 * The content of one tab of the Claude tool window. It holds a terminal that runs one
 * review session. The plugin owns the command line. It reads the command from the
 * settings, and it appends the channel flags itself, so no shell function of one machine
 * has to carry them.
 *
 * The panel reports every change of the session through [onState], and the tab that holds
 * the panel writes that state into its own name. A terminal stays on screen after the
 * session ends, and the last output stays readable. A new start drops the dead terminal
 * and mounts a new one. The empty state with the bridge status shows before the first
 * session of the tab only.
 *
 * The state follows the session behind the terminal, not the component on screen. Two
 * paths report the end, and each one alone is enough. The first path is the state flow of
 * the view, which turns to Terminated when the process exits. The second path is a press
 * on Stop, which ends the session before that flow can report it.
 */
class ClaudeSessionPanel(
    private val project: Project,
    private val sessionName: String,
    private val onState: (SessionState) -> Unit
) : JPanel(BorderLayout()), Disposable {

    /**
     * The address of this session on the bridge. It lives as long as the panel, so a stop
     * and a new start keep one address and the picker keeps one row.
     */
    val sessionKey: String = SessionKey.newKey()

    private val status = statusArea()
    private val idle = JBPanelWithEmptyText(BorderLayout())

    /** The tab on screen. It stays after the session ends, because the output stays. */
    private var terminal: ReviewSession? = null

    /** The tab of the running session. It becomes null the moment the session ends. */
    private var session: ReviewSession? = null

    /** True between the press on Start and the mount of the terminal. */
    private var starting = false

    /** The configuration file of the running session. It goes away with the session. */
    private var configFile: Path? = null

    init {
        SessionRegistry.getInstance(project).add(sessionKey, sessionName)
        add(status, BorderLayout.SOUTH)
        showIdle(NO_SESSION, AUTO_START)
    }

    override fun dispose() {
        SessionRegistry.getInstance(project).remove(sessionKey)
        dropConfig()
        terminal?.close()
    }

    val isRunning: Boolean
        get() = session != null

    /**
     * The tool window opens the first session through this method, because a fresh panel
     * can hold no size yet. The terminal then mounts into a panel that already holds a
     * size, so the first paint of the session shows the whole window.
     */
    fun startWhenSized() = SizeGate.run(this) { start() }

    /**
     * A new tab reaches this through [startWhenSized]. The title bar button calls it for
     * every later session of the tab, and it calls it whatever the size is, because the
     * user looks at a window that is on screen.
     *
     * The bridge opens a port and writes a file, so the wait for it stays off this thread.
     * The terminal mounts on this thread again, after the bridge answers or after the wait
     * ends. A second press during the wait does nothing.
     */
    fun start() {
        if (isRunning || starting) return
        val basePath = project.basePath ?: return failed(NO_SESSION)
        starting = true
        onState(SessionState.STARTING)
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
            .onFailure {
                thisLogger().warn("The review session wrote no channel configuration file.", it)
                SessionLog.getInstance(project).record(SessionRecord.Failure.of(CONFIG_WORK, it))
            }
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
        val plan = SessionPlan.of(
            basePath,
            bridge,
            settings().claudeCommand,
            server,
            javaPath,
            written?.toString(),
            sessionKey,
        )
        val started = ReviewTerminal.open(project, plan)
        if (started == null) {
            dropConfig()
            record(plan, server, javaPath, written, terminalStarted = false)
            return failed(NO_TERMINAL)
        }
        terminal?.let { drop(it) }
        remove(idle)
        terminal = started
        session = started
        watch(started)
        add(started.view.component, BorderLayout.CENTER)
        onState(SessionState.RUNNING)
        status.text = plan.status
        record(plan, server, javaPath, written, terminalStarted = true)
        revalidate()
        repaint()
        IdeFocusManager.getInstance(project).requestFocus(started.view.preferredFocusableComponent, true)
    }

    /**
     * Keeps what this start did, so a report can explain a session that went wrong.
     *
     * The record reads the address of the bridge from the plan, and it reads no other value
     * of the environment. The token therefore never reaches it.
     */
    private fun record(
        plan: SessionPlan,
        server: ChannelServer.Answer,
        javaPath: String?,
        configFile: Path?,
        terminalStarted: Boolean,
    ) = SessionLog.getInstance(project).record(
        SessionRecord.Session.of(
            plan = plan,
            server = server,
            javaPath = javaPath,
            configFile = configFile?.toString(),
            terminalStarted = terminalStarted,
        )
    )

    /**
     * Follows the session behind the terminal. The view reports Terminated after the
     * process exits. The wrapper shell carries no flag that keeps it alive, so it exits
     * with the agent. The collector runs on the scope of the view, so a dispose of the tab
     * ends it, and [onTermination] moves the work to the user interface thread.
     */
    private fun watch(started: ReviewSession) = started.view.coroutineScope.launch {
        started.view.sessionState.first { it == TerminalViewSessionState.Terminated }
        onTermination(started)
    }

    /**
     * The close of the session ends the process. The terminal keeps its editors while
     * the component is on screen, so the last output stays readable. A second press does
     * nothing.
     */
    fun stop() {
        val live = session ?: return
        live.close()
        endSession()
    }

    /**
     * The end of the process arrives here, and it does not run on the user interface
     * thread. A report that finds no session of [ended] changes nothing, so a press on
     * Stop can end the session first, and a new start can outrun a late report.
     */
    private fun onTermination(ended: ReviewSession) = ApplicationManager.getApplication().invokeLater {
        if (session === ended) endSession()
    }

    private fun endSession() {
        session = null
        dropConfig()
        onState(SessionState.ENDED)
    }

    /**
     * The component leaves the panel first. The close of the session then ends it, and
     * the terminal releases its editors, because the component is off screen.
     */
    private fun drop(ended: ReviewSession) {
        remove(ended.view.component)
        ended.close()
    }

    private fun failed(headline: String) {
        starting = false
        onState(SessionState.NOT_STARTED)
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

    private companion object {
        const val CONFIG_WORK = "write the channel configuration file"
        const val NO_SESSION = "No review session runs."
        const val NO_TERMINAL = "The terminal did not start. The IDE log holds the reason."
        const val NO_DIRECTORY = "This project has no directory, so a session cannot start here."
        const val PRESS_START = "Press Start in the title bar to open a session with the comment channel."
        const val AUTO_START = "The session opens by itself with the comment channel."
        const val BRIDGE_WAIT = "The review bridge starts now. The session opens after the bridge answers."
    }
}
