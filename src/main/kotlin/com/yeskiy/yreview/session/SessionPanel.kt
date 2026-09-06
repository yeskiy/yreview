package com.yeskiy.yreview.session

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Condition
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.terminal.frontend.view.TerminalViewSessionState
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.ui.JBUI
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.bridge.OpenCodeClient
import com.yeskiy.yreview.bridge.OpenCodeTitle
import com.yeskiy.yreview.bridge.SessionKey
import com.yeskiy.yreview.diagnostic.Redact
import com.yeskiy.yreview.diagnostic.SessionLog
import com.yeskiy.yreview.diagnostic.SessionRecord
import com.yeskiy.yreview.settings.ReviewConfigurable
import com.yeskiy.yreview.settings.ReviewSettings
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.nio.file.Path
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import javax.swing.JPanel
import javax.swing.JTextArea

/**
 * What one start of a session reads off the machine and writes onto it.
 *
 * The panel builds this away from the thread that draws the window, and the mount then
 * reads it. Every field of it is the answer of a lookup, of a write, or of a port bind.
 */
private class SessionSetup(
    val bridge: BridgeLookup,
    val agent: AgentSpec,
    val server: ChannelServer.Answer,
    val javaPath: String?,
    /** The configuration file of the agent, or null while this session carries no channel. */
    val configFile: Path?,
    /** The loopback server of this session, or null while it runs none. */
    val local: LocalServer?,
)

/**
 * The content of one tab of the session tool window. It holds a terminal that runs one
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
 * The state follows the session behind the terminal, not the component on screen. Three
 * paths report the end, and each one alone is enough. The first path is the state flow of
 * the view, which turns to Terminated when the process exits. That flow runs on a scope
 * that the terminal owns, so a report of it can be lost. The second path therefore reads
 * the state that the terminal holds now, every time somebody asks whether this session
 * runs. The third path is a press on Stop, which ends the session before any report.
 */
class SessionPanel(
    private val project: Project,
    private val number: Int,
    private val autoStart: Boolean,
    /** The source of the terminal of one session. The panel owns every other start step. */
    private val openTerminal: (SessionPlan) -> ReviewSession? = { ReviewTerminal.open(project, it) },
    private val onState: (SessionState) -> Unit,
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

    /** The loopback port of a session that runs its own HTTP server. Null for every other. */
    private var httpPort: Int? = null

    /** The password of that server. It travels in a file that the shell reads and removes. */
    private var httpPassword: String? = null

    /** The poll that reads the name of an OpenCode session. Null while none runs. */
    private var namePoll: ScheduledFuture<*>? = null

    /** The moment the terminal of the running session mounted. The life counts from it. */
    private var mountedAt = 0L

    /** The number of starts that the last press on Start made. A new press clears it. */
    private var tries = 0

    /**
     * How many sentences the status line took.
     *
     * The idle sentence reads the disk, so it arrives from another thread. The count tells
     * that answer whether the line still waits for it. An answer of an earlier read writes
     * nothing, and the newest sentence stays. Every write of the line runs on the thread
     * that draws the window, so the count needs no lock.
     */
    private var statusWrites = 0

    /**
     * True after [dispose] ran.
     *
     * Two paths reach [dispose]. A close of the tab disposes the content, and the content
     * disposes this panel. A close of the project calls the method itself. This flag holds
     * for both paths, and no other state of the panel answers this question.
     */
    @Volatile
    private var disposed = false

    /**
     * True after the project closed, or after the tab of this panel closed.
     *
     * Every job that leaves this panel for another thread carries it. The user interface
     * thread then drops a job that comes back to a tab which is gone. A dropped job opens
     * no terminal, so nothing runs that nobody can close.
     */
    private val gone = Condition<Any?> { disposed || project.isDisposed }

    /**
     * The agent the running session started with. A change of the setting never moves a
     * running session, so the buttons of that tab keep naming this agent.
     */
    var runningAgent: AgentSpec? = null
        private set

    /**
     * The name that the agent of this session gave it, or null while it gave none.
     *
     * The name belongs to one session. A new start drops it, and a session that ended
     * keeps it, because the output of that session is still on screen.
     */
    var agentName: String? = null
        private set

    /**
     * The agent of the last session of this tab. It is never cleared, so a tab that shows
     * the output of a session that ended keeps the name of the agent that wrote it.
     */
    private var lastAgent: AgentSpec? = null

    /**
     * The agent that this tab names.
     *
     * A tab that ran a session names that agent. A tab that never ran names the agent of
     * the settings, and it names none while nobody chose.
     */
    val tabAgent: AgentSpec?
        get() = lastAgent
            ?: settings().takeIf { it.agentChosen }?.let { AgentCatalog.of(it.agentOrDefault()) }

    init {
        SessionRegistry.getInstance(project).add(sessionKey, stableName(), SessionReach.None)
        project.messageBus.connect(this).subscribe(SESSION_NAMES, SessionNameListener { onChoice() })
        add(status, BorderLayout.SOUTH)
        showState()
    }

    override fun dispose() {
        disposed = true
        namePoll?.cancel(false)
        namePoll = null
        dropSecret()
        SessionRegistry.getInstance(project).remove(sessionKey)
        terminal?.close()
    }

    /**
     * Takes the password of this tab off the disk.
     *
     * The shell of a session that started already removed the file. This call answers for
     * every other path, such as a terminal that never started, and a tab that closes while
     * the shell still waits for its first paint.
     */
    private fun dropSecret() {
        runCatching { secretFile().delete() }
    }

    /**
     * True while a review session runs behind this tab.
     *
     * The terminal holds the state of its own process, and this property reads that state.
     * A session whose process is gone ends here, so one lost report costs nothing and the
     * tab still gains the mark of a session that ended.
     */
    val isRunning: Boolean
        get() {
            if (stopped()) endSession()
            return session != null
        }

    /** True while a session stands in this tab and the process behind it already exited. */
    private fun stopped(): Boolean =
        session?.view?.sessionState?.value == TerminalViewSessionState.Terminated

    /** True while the window may run something. No agent is a choice, and it runs nothing. */
    val startable: Boolean
        get() = settings().agentChosen && AgentCatalog.of(settings().agentOrDefault()).runnable

    /**
     * The tool window opens the first session through this method, because a fresh panel
     * can hold no size yet. The terminal then mounts into a panel that already holds a
     * size, so the first paint of the session shows the whole window.
     */
    fun startWhenSized() = SizeGate.run(this) { if (startable) start() }

    /**
     * A new tab reaches this through [startWhenSized]. The title bar button calls it for
     * every later session of the tab, and it calls it whatever the size is, because the
     * user looks at a window that is on screen.
     *
     * A press on Start sets the count of starts back to zero.
     */
    fun start() = start(again = false)

    /**
     * The bridge opens a port and writes a file, so the wait for it stays off this thread.
     * The setup of the session follows it there, because it writes two files and binds one
     * port. The terminal mounts on this thread again, after that work ends. A second press
     * during the wait does nothing, because [starting] holds until the mount.
     *
     * A tab that closes during the work leaves no password on the disk. [dispose] sets its
     * flag first and removes the file after it. This thread reads that flag after the
     * write. One of the two paths therefore always removes the file.
     *
     * [again] is true for the start that follows a lost port. Such a start keeps the count
     * of the press that opened the chain. The status line then names the reason.
     */
    private fun start(again: Boolean) {
        if (isRunning || starting || !startable) return
        val basePath = project.basePath ?: return failed(NO_SESSION)
        if (!again) tries = 0
        starting = true
        agentName = null
        onState(SessionState.STARTING)
        if (terminal == null) setStatus(BRIDGE_WAIT)
        ApplicationManager.getApplication().executeOnPooledThread {
            val setup = prepare(awaitBridge(basePath))
            if (gone.value(null)) {
                dropSecret()
                return@executeOnPooledThread
            }
            ApplicationManager.getApplication()
                .invokeLater({ mount(basePath, setup, again) }, gone)
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

    /** The name of this tab with no state word. The tabs keep it current after every change. */
    private fun stableName(): String =
        SessionRules.name(TabFacts(number, tabAgent?.short, SessionState.NOT_STARTED))

    private fun channelServer(): ChannelServer.Answer = ChannelServer.locate()

    private fun javaPath(): String? = JavaRuntime.locate()

    /**
     * The file appears only when the route of the agent reads one, the bridge answers, the
     * plugin holds the server, and the IDE names a Java runtime. A failed write leaves the
     * session without the review server.
     */
    private fun writeConfig(
        agent: AgentSpec,
        bridge: BridgeLookup,
        server: ChannelServer.Answer,
        javaPath: String?,
    ): Path? {
        if (!AgentMcp.needsFile(agent)) return null
        if (bridge !is BridgeLookup.Available || server !is ChannelServer.Answer.Found) return null
        javaPath ?: return null
        return runCatching { ChannelConfig.write(agent.id, javaPath, server.path) }
            .onFailure {
                thisLogger().warn(
                    "The review session wrote no server configuration file.",
                    Redact.failure(it, Redact.homes(), project.basePath),
                )
                SessionLog.getInstance(project).record(SessionRecord.Failure.of(CONFIG_WORK, it))
            }
            .getOrNull()
    }

    /**
     * Puts the password of the session on disk, and answers the path of that file.
     *
     * Null after a failed write. The session then opens no port of its own, because a
     * server that starts without a password answers every request of this machine.
     */
    private fun writePassword(password: String): String? =
        runCatching {
            secretFile().also { it.write(password) }.path.toString()
        }.onFailure {
            thisLogger().warn(
                "The review session wrote no password file, so it opens no port of its own.",
                Redact.failure(it, Redact.homes(), project.basePath),
            )
            SessionLog.getInstance(project).record(SessionRecord.Failure.of(PASSWORD_WORK, it))
        }.getOrNull()

    /** The file of this tab. One session owns one file, and a new start replaces it. */
    private fun secretFile() = SecretFile.forSession(sessionKey)

    /**
     * Reads the machine and writes the files that one start needs.
     *
     * The call stands on a pooled thread. It looks for the channel server and for the Java
     * runtime, it writes the configuration file of the agent, it binds a port, and it
     * writes the password file. Every one of those holds a thread for as long as the disk
     * takes. The thread that draws the window must therefore run none of them.
     */
    private fun prepare(bridge: BridgeLookup): SessionSetup {
        val agent = AgentCatalog.of(settings().agentOrDefault())
        val server = channelServer()
        val javaPath = javaPath()
        return SessionSetup(
            bridge = bridge,
            agent = agent,
            server = server,
            javaPath = javaPath,
            configFile = writeConfig(agent, bridge, server, javaPath),
            local = LocalServer.of(agent) { writePassword(it) },
        )
    }

    /**
     * Puts the terminal of one start on screen. It runs on the thread that draws the
     * window, because a terminal component goes into this panel.
     *
     * A tab that already runs a session keeps that session, and the password of the start
     * that stops here leaves the disk.
     */
    private fun mount(basePath: String, setup: SessionSetup, again: Boolean) {
        starting = false
        if (isRunning) {
            dropSecret()
            return
        }
        httpPort = setup.local?.port
        httpPassword = setup.local?.password
        SessionRegistry.getInstance(project)
            .setReach(sessionKey, SessionReach.of(setup.agent, httpPort, httpPassword))
        val plan = SessionPlan.of(
            basePath,
            setup.bridge,
            setup.agent,
            settings().command(setup.agent.id),
            setup.server,
            setup.javaPath,
            setup.configFile?.toString(),
            sessionKey,
            httpPort,
            setup.local?.passwordFile,
        )
        val started = openTerminal(plan)
        if (started == null) {
            forget()
            record(plan, setup.server, setup.javaPath, setup.configFile, terminalStarted = false)
            return failed(NO_TERMINAL)
        }
        terminal?.let { drop(it) }
        remove(idle)
        terminal = started
        session = started
        mountedAt = System.currentTimeMillis()
        tries += 1
        runningAgent = setup.agent
        lastAgent = setup.agent
        watch(started)
        started.watchTitle { raw ->
            ApplicationManager.getApplication()
                .invokeLater({ nameFromAgent(AgentTitle.of(setup.agent, raw)) }, gone)
        }
        add(started.view.component, BorderLayout.CENTER)
        onState(SessionState.RUNNING)
        setStatus(if (again) "$PORT_TAKEN ${plan.status}" else plan.status)
        record(plan, setup.server, setup.javaPath, setup.configFile, terminalStarted = true)
        watchName(setup.agent, plan.workingDirectory)
        revalidate()
        repaint()
        IdeFocusManager.getInstance(project).requestFocus(started.view.preferredFocusableComponent, true)
    }

    /**
     * Keeps what this start did, so a report can explain a session that went wrong.
     *
     * The record reads the address of the bridge from the plan, and the plan holds no
     * token. The token therefore never reaches it.
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
        endSession(PLAIN_END)
    }

    /**
     * Runs on the user interface thread. A name that did not change writes nothing, so the
     * spinner of an agent cannot make the tab flicker.
     */
    fun nameFromAgent(text: String?) {
        if (agentName == text) return
        agentName = text
        project.messageBus.syncPublisher(SESSION_NAMES).namesChanged()
    }

    /**
     * Reads the name of a session that answers a port of its own.
     *
     * Only OpenCode needs this, because it writes no terminal title. The poll runs on a
     * pooled thread and it stops with the session. A failed read changes nothing, so a
     * server that is not up yet costs one quiet call.
     */
    private fun watchName(agent: AgentSpec, directory: String) {
        namePoll?.cancel(false)
        namePoll = null
        val port = httpPort ?: return
        val password = httpPassword ?: return
        if (agent.id != AgentId.OPENCODE) return
        namePoll = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { readName(port, password, directory) },
            NAME_DELAY_SECONDS,
            NAME_DELAY_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * Runs on a pooled thread. The report of the name moves to the user interface thread.
     *
     * A read that comes back after its own session ended names nothing, because the panel
     * then holds another port or none.
     */
    private fun readName(port: Int, password: String, directory: String) {
        if (gone.value(null)) return
        val rows = OpenCodeClient.sessions(port, password) ?: return
        val found = OpenCodeTitle.pick(rows, directory)
        ApplicationManager.getApplication()
            .invokeLater({ if (httpPort == port) nameFromAgent(found) }, gone)
    }

    /**
     * The end of the process arrives here, and it does not run on the user interface
     * thread. A report that finds no session of [ended] changes nothing, so a press on
     * Stop can end the session first, and a new start can outrun a late report.
     *
     * A session that ended inside the limit of [PortRetry] lost its port to another
     * process. This tab then starts again, and the mount picks a new port. A session that
     * lived longer sets the count back to zero.
     */
    private fun onTermination(ended: ReviewSession) = ApplicationManager.getApplication().invokeLater(
        {
            if (session !== ended) return@invokeLater
            val push = runningAgent?.push ?: PushKind.NONE
            val lived = System.currentTimeMillis() - mountedAt
            val again = PortRetry.again(push, lived, tries)
            endSession()
            if (lived >= PortRetry.SHORT_MILLIS) tries = 0
            if (again) start(again = true)
        },
        gone,
    )

    /**
     * Ends one run of this tab and tells the user that the session is over.
     *
     * The status line carries the sentence of the mount while a session runs, and that
     * sentence describes a session that started. A session that ended needs another one.
     */
    private fun endSession(text: String = endText()) {
        session = null
        forget()
        setStatus(text)
        onState(SessionState.ENDED)
    }

    /**
     * What the status line says about a session that ended by itself.
     *
     * A session that ends inside [QUICK_MILLIS] ran no work of the user. The terminal then
     * holds the whole output of the command, and that output names the reason.
     */
    private fun endText(): String =
        if (System.currentTimeMillis() - mountedAt < QUICK_MILLIS) QUICK_END else PLAIN_END

    /**
     * Drops everything that belonged to one run. Nothing may reach a session that ended,
     * so the registry hears that this tab takes no send until the next start.
     */
    private fun forget() {
        namePoll?.cancel(false)
        namePoll = null
        httpPort = null
        httpPassword = null
        runningAgent = null
        dropSecret()
        SessionRegistry.getInstance(project).setReach(sessionKey, SessionReach.None)
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
        setStatus("")
        add(idle, BorderLayout.CENTER)
        revalidate()
        repaint()
        askBridgeState()
    }

    /**
     * Writes the status line, and drops every answer that an earlier read still owes.
     *
     * The line therefore carries the newest sentence, and a slow read of the disk can
     * never write over the sentence of a session that started after it.
     */
    private fun setStatus(text: String) {
        statusWrites += 1
        status.text = text
    }

    /**
     * Reads the idle sentence away from the thread that draws the window.
     *
     * [bridgeState] looks for the file of the bridge, for the channel server and for the
     * Java runtime, and each one of those asks the disk. The window therefore draws first
     * and takes the sentence when it arrives.
     */
    private fun askBridgeState() {
        val ask = statusWrites
        ApplicationManager.getApplication().executeOnPooledThread {
            val text = bridgeState()
            ApplicationManager.getApplication()
                .invokeLater({ if (statusWrites == ask) status.text = text }, gone)
        }
    }

    /** The idle state that the stored choice asks for. A project with no choice gets the selector. */
    private fun showState() = when {
        !settings().agentChosen -> showSelector()
        settings().agentOrDefault() == AgentId.NONE -> showIdle(AgentRows.NO_AGENT, "")
        else -> showIdle(NO_SESSION, if (autoStart) AUTO_START else PRESS_START)
    }

    /**
     * Reads the choice of the project again, because something wrote one.
     *
     * A tab that holds a terminal keeps it. That terminal shows a session that runs, or the
     * output of a session that ended, and no empty screen may cover it. A tab that waits
     * shows the state of the new choice, so the chooser goes as soon as a choice stands.
     */
    private fun onChoice() {
        if (terminal != null || starting) return
        showState()
    }

    /**
     * The idle state of a project where nobody chose an agent yet.
     *
     * A press on a line writes the choice and starts a session. The search runs on a
     * pooled thread, so the panel draws at once and fills itself when the answer arrives.
     */
    private fun showSelector() {
        val answer = AgentScan.getInstance().latest()
        idle.emptyText.setText(if (chosenBefore()) AgentRows.UNKNOWN_CHOICE else AgentRows.CHOOSE)
        if (!answer.scanned) {
            idle.emptyText.appendLine(AgentRows.SEARCHING)
            AgentScan.getInstance().refresh { onScan() }
        } else {
            if (!answer.anyFound) idle.emptyText.appendLine(AgentRows.NOTHING_FOUND)
            AgentRows.offered(answer).forEach { spec ->
                idle.emptyText.appendLine(
                    AgentRows.row(spec, found = answer.of(spec.id).found),
                    SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES,
                ) { choose(spec) }
            }
            if (answer.anyFound) idle.emptyText.appendLine(AgentRows.OTHER_AGENTS)
        }
        setStatus("")
        add(idle, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    /** The answer arrives on a pooled thread, so the redraw moves to the other thread. */
    private fun onScan() = ApplicationManager.getApplication()
        .invokeLater({ if (!settings().agentChosen) showSelector() }, gone)

    /** True while a name is stored that this build does not know. */
    private fun chosenBefore(): Boolean = !settings().state.agent.isNullOrBlank()

    /**
     * A press on a row writes the choice. Another agent opens the settings page, because
     * the user must type a command there. No agent shows one sentence and starts nothing.
     */
    private fun choose(spec: AgentSpec) {
        settings().agent = spec.id
        when (spec.id) {
            AgentId.CUSTOM -> {
                openSettings()
                showState()
            }
            AgentId.NONE -> showIdle(AgentRows.NO_AGENT, "")
            else -> {
                showIdle(NO_SESSION, AUTO_START)
                start()
            }
        }
    }

    /** The page holds the command field, the full agent list, and the Add button. */
    private fun openSettings() =
        ShowSettingsUtil.getInstance().showSettingsDialog(project, ReviewConfigurable::class.java)

    /**
     * The idle sentence about the bridge. It runs on a pooled thread, because it reads the
     * disk three times.
     *
     * An agent that runs nothing needs no line about the bridge, and it must not be nagged.
     */
    private fun bridgeState(): String {
        val agent = AgentCatalog.of(settings().agentOrDefault())
        if (!agent.runnable) return ""
        val basePath = project.basePath ?: return NO_DIRECTORY
        return SessionPlan.of(
            basePath,
            lookup(basePath),
            agent,
            settings().command(agent.id),
            channelServer(),
            javaPath(),
        ).status
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
        const val NAME_DELAY_SECONDS = 3L

        /** The longest life of a session that carried no work of the user. */
        const val QUICK_MILLIS = 2_000L

        const val CONFIG_WORK = "write the server configuration file"
        const val PASSWORD_WORK = "write the password file of the session"
        const val PLAIN_END = "The review session ended. The last output stays above."
        const val QUICK_END = "The review session ended at once. The terminal above holds the reason. " +
            "A command that the shell cannot find ends a session this way."
        const val NO_SESSION = "No review session runs."
        const val NO_TERMINAL = "The terminal did not start. The IDE log holds the reason."
        const val NO_DIRECTORY = "This project has no directory, so a session cannot start here."
        const val PRESS_START = "Press Start in the title bar to open a session with the comment channel."
        const val AUTO_START = "The session opens by itself with the comment channel."
        const val BRIDGE_WAIT = "The review bridge starts now. The session opens after the bridge answers."
        const val PORT_TAKEN = "The session ended at once, so the plugin started it again."
    }
}
