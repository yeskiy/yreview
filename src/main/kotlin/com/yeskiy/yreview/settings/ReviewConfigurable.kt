package com.yeskiy.yreview.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.intellij.util.ui.JBUI
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.gutter.CommentGutter
import com.yeskiy.yreview.handoff.HandoffPlace
import com.yeskiy.yreview.session.AgentCatalog
import com.yeskiy.yreview.session.AgentId
import com.yeskiy.yreview.session.AgentLaunch
import com.yeskiy.yreview.session.AgentMcp
import com.yeskiy.yreview.session.AgentRows
import com.yeskiy.yreview.session.AgentScan
import com.yeskiy.yreview.session.AgentSpec
import com.yeskiy.yreview.session.ChannelServer
import com.yeskiy.yreview.session.JavaRuntime
import com.yeskiy.yreview.session.McpRoute
import com.yeskiy.yreview.session.SESSION_NAMES
import com.yeskiy.yreview.store.NotesSharing
import java.awt.Font
import java.nio.file.Files
import java.nio.file.Path
import javax.swing.DefaultComboBoxModel
import javax.swing.JButton
import javax.swing.JComponent

/**
 * The box that prints the real strings the session appends.
 *
 * The text holds one command, and a user may copy it. The area wraps that command by
 * character, so a long line never widens the whole dialog. A wrap changes the picture
 * alone, so the copy still carries every character of the one line.
 */
object ArgumentArea {

    fun build() = JBTextArea().apply {
        isEditable = false
        isOpaque = false
        lineWrap = true
        wrapStyleWord = false
        font = JBUI.Fonts.create(Font.MONOSPACED, JBUI.Fonts.label().size)
        border = JBUI.Borders.empty(4, 8)
    }
}

class ReviewConfigurable(private val project: Project) : Configurable {

    private val choice = ComboBox(CommentSharing.entries.toTypedArray())

    private val channel = JBCheckBox("Send the review tasks through the channel")

    private val sessionWindow = JBCheckBox("Show the session tool window")

    private val maximize = JBCheckBox("Hide the editor beside a maximized tool window")

    private val agents = ComboBox(AgentCatalog.ALL.toTypedArray())

    private val agentHelp = helpArea()

    private val command = JBTextField()

    private val commandHelp = helpArea()

    private val appended = ArgumentArea.build()

    private val tools = helpArea()

    private val addServer = JButton("Add")

    private val addState = JBLabel()

    private val remote = JBTextField()

    private val refspec = JBCheckBox("Add the notes refspec to the git configuration")

    private val editorMarks = JBCheckBox("Show comment marks in the editor")

    private val autoStart = JBCheckBox("Start a session when the session tool window opens")

    /** The command of every agent while the page is open. Apply writes them all. */
    private val typed = linkedMapOf<AgentId, String>()

    /** The agent the box showed last, so a switch keeps what the user typed for it. */
    private var shown: AgentId = AgentCatalog.DEFAULT

    /** True while the page fills the box itself. A new model fires the listener of the box. */
    private var filling = false

    override fun getDisplayName(): String = ProductName.TEXT

    override fun createComponent(): JComponent {
        choice.renderer = textListCellRenderer<CommentSharing> { it.label }
        agents.renderer = textListCellRenderer<AgentSpec> { it.label }
        agents.addActionListener { if (!filling) switchAgent() }
        addServer.addActionListener { runAdd() }
        return panel {
            row("New comments:") {
                cell(choice)
            }
            row {
                comment(
                    "A local comment stays in refs/notes/y-review/local, and the plugin never pushes it. " +
                        "A shared comment goes to refs/notes/devtools/discuss, and the plugin pushes that ref " +
                        "to the remote below. The add-comment dialog can change the choice for one comment."
                )
            }
            row("Remote for shared comments:") {
                cell(remote).align(AlignX.FILL)
            }
            row {
                comment(
                    "The plugin pushes a shared note to this remote. " +
                        "A blank field falls back to " + ReviewSettings.DEFAULT_REMOTE + "."
                )
            }
            row {
                cell(refspec)
            }
            row {
                comment(
                    "The plugin adds " + NotesSharing.FETCH_REFSPEC + " to the fetch list of that remote " +
                        "once, so the notes other people write come back with the next fetch. " +
                        "With the box clear the plugin writes no git configuration, " +
                        "and you add that line by hand."
                )
            }
            row {
                cell(channel)
            }
            row {
                comment(channelHelp())
            }
            row {
                cell(sessionWindow)
            }
            row {
                comment(
                    "The session tool window runs the review sessions inside the IDE. " +
                        "The plus button in the title bar opens one more session in a tab of its own. " +
                        "A close of the tab ends the session and the process behind it. " +
                        "The Send button of the review window names the session that gets the tasks. " +
                        "It asks for one while two or more sessions can take the tasks. " +
                        "The window shows by default, and a clear box hides it. " +
                        "The window appears and disappears at once, so no restart is needed."
                )
            }
            row("Command line agent:") {
                cell(agents).align(AlignX.FILL)
            }
            row {
                comment(
                    "The session window runs this agent. " +
                        "A running session keeps the agent it started with. " +
                        "The next session uses the new choice."
                )
            }
            row {
                cell(agentHelp).align(AlignX.FILL)
            }
            row("Command:") {
                cell(command).align(AlignX.FILL)
            }
            row {
                cell(commandHelp).align(AlignX.FILL)
            }
            row {
                cell(appended).align(AlignX.FILL)
            }
            row {
                comment(
                    "The box above holds the real strings of this agent. " +
                        "The plugin appends the arguments of a session only when the bridge answers " +
                        "and the review server can run. " +
                        "An entry in a configuration file alone never registers a channel."
                )
            }
            row {
                cell(tools).align(AlignX.FILL)
            }
            row {
                cell(addServer)
                cell(addState)
            }
            row {
                cell(autoStart)
            }
            row {
                comment(
                    "The session tool window starts the session of its first tab as soon as it opens. " +
                        "With the box clear that tab opens and waits, " +
                        "and the Start button in the title bar starts the session. " +
                        "The plus button always starts the session of the tab it opens."
                )
            }
            row {
                cell(editorMarks)
            }
            row {
                comment(
                    "An open editor shows one icon for each comment range, and a quiet background " +
                        "over the lines of that range. " +
                        "With the box clear the editor stays plain, and the tool window still lists " +
                        "every comment."
                )
            }
            row {
                cell(maximize)
            }
            row {
                comment(
                    "A double click on the header of a tool window maximizes that window. " +
                        "The switch changes one size of the whole IDE, the registry key " +
                        EditorStrip.KEY + ". " +
                        "That size holds for every tool window, and not for the windows of this plugin alone. " +
                        "The IDE reads the new size at once, so no restart is needed. " +
                        "With the switch on, the user can also drag the divider until the editor has zero size. " +
                        "The plugin writes the earlier size again after the user clears this box."
                )
            }
        }
    }

    override fun isModified(): Boolean =
        selected() != settings().sharing ||
            channel.isSelected != settings().channel ||
            sessionWindow.isSelected != shown() ||
            maximize.isSelected != MaximizeSettings.getInstance().full ||
            selectedAgent().id != settings().agentOrDefault() ||
            !settings().agentChosen ||
            commandsChanged() ||
            remote.text.trim() != settings().remote ||
            refspec.isSelected != settings().writeRefspec ||
            editorMarks.isSelected != settings().editorMarks ||
            autoStart.isSelected != settings().autoStartSession

    override fun apply() {
        settings().sharing = selected()
        settings().channel = channel.isSelected
        settings().sessionWindow = sessionWindow.isSelected
        typed[selectedAgent().id] = command.text
        typed.forEach { (id, text) -> settings().setCommand(id, text) }
        AgentCatalog.ALL.forEach { typed[it.id] = settings().command(it.id) }
        settings().agent = selectedAgent().id
        settings().remote = remote.text
        settings().writeRefspec = refspec.isSelected
        settings().editorMarks = editorMarks.isSelected
        settings().autoStartSession = autoStart.isSelected
        showAgent()
        remote.text = settings().remote
        BridgeService.getInstance(project).applySwitch(channel.isSelected)
        SessionWindow.show(project, sessionWindow.isSelected)
        MaximizeSettings.getInstance().switch(maximize.isSelected)
        CommentGutter.getInstance(project).applyMarkSwitch(editorMarks.isSelected)
        project.messageBus.syncPublisher(SESSION_NAMES).namesChanged()
    }

    override fun reset() {
        choice.selectedItem = settings().sharing
        channel.isSelected = settings().channel
        sessionWindow.isSelected = shown()
        maximize.isSelected = MaximizeSettings.getInstance().full
        typed.clear()
        AgentCatalog.ALL.forEach { typed[it.id] = settings().command(it.id) }
        shown = settings().agentOrDefault()
        fillAgents()
        showAgent()
        remote.text = settings().remote
        refspec.isSelected = settings().writeRefspec
        editorMarks.isSelected = settings().editorMarks
        autoStart.isSelected = settings().autoStartSession
        startScan()
    }

    /**
     * The platform builds and resets this page on the user interface thread, so nothing
     * here waits for a search. The search runs on a pooled thread, and the answer fills
     * the two help lines when it lands.
     *
     * Every open of the page asks for one search, because a user can install an agent
     * while the project stays open. The page shows the answer of the last search until the
     * new one lands, so every control stays usable.
     */
    private fun startScan() {
        AgentScan.getInstance().refresh {
            ApplicationManager.getApplication().invokeLater(
                {
                    fillAgents()
                    refreshHelp()
                },
                project.disposed,
            )
        }
    }

    /** The box lists the found agents first. A fresh scan fills it again, and [shown] stays. */
    private fun fillAgents() {
        filling = true
        try {
            agents.model = DefaultComboBoxModel(
                AgentCatalog.ordered(AgentScan.getInstance().latest().installs.filterValues { it.found }.keys)
                    .toTypedArray()
            )
            agents.selectedItem = AgentCatalog.of(shown)
        } finally {
            filling = false
        }
    }

    /** Every switch of the box keeps what the user typed for the agent it leaves. */
    private fun switchAgent() {
        typed[shown] = command.text
        showAgent()
    }

    private fun showAgent() {
        val spec = selectedAgent()
        shown = spec.id
        command.text = typed.getOrPut(spec.id) { settings().command(spec.id) }
        refreshHelp()
        tools.text = AgentMcp.help(spec)
        showAdd(spec)
    }

    /**
     * The three lines that read this machine. A late answer of the search lands here as
     * well, and the command field keeps what the user typed.
     *
     * The preview box names the launcher that a press on Add really starts, so the box and
     * the button never disagree about the program.
     */
    private fun refreshHelp() {
        val spec = selectedAgent()
        agentHelp.text = AgentRows.row(spec, AgentScan.getInstance().latest().of(spec.id).found)
        commandHelp.text = commandHelp(spec)
        appended.text = AgentLaunch.appendedText(
            spec.id,
            javaPath() ?: AgentLaunch.JAVA_PLACE,
            serverPath() ?: AgentLaunch.SERVER_PLACE,
            addProgram(spec),
        )
    }

    private fun selectedAgent(): AgentSpec = agents.selectedItem as? AgentSpec ?: AgentCatalog.of(AgentCatalog.DEFAULT)

    private fun commandsChanged(): Boolean {
        typed[selectedAgent().id] = command.text
        return typed.any { (id, text) -> text.trim() != settings().command(id) }
    }

    /** One line about this machine, and it never says that an agent is not installed. */
    private fun commandHelp(spec: AgentSpec): String =
        "A shell runs this one command, and the shell loads the profile of the user. " +
            "Paste a full path when the command is not on the PATH. A shell function works too. " +
            AgentRows.place(spec, AgentScan.getInstance().latest())

    /** The button shows only for a route that writes a file the user owns. */
    private fun showAdd(spec: AgentSpec) {
        val stored = spec.mcp == McpRoute.AddCommand || spec.mcp is McpRoute.UserFile
        addServer.isVisible = stored
        addState.isVisible = stored
        addServer.isEnabled = stored && javaPath() != null && serverPath() != null
        addState.text = when {
            !stored -> ""
            settings().mcpAdded(spec.id) -> "The plugin already registered the review server for ${spec.label}."
            addServer.isEnabled -> "Nothing is written until you press Add."
            else -> "The plugin holds no channel server or no Java runtime, so it can write nothing."
        }
    }

    /**
     * Runs the command of the agent, or writes the file of the project.
     *
     * A command runs with no shell, so nothing of the text reaches a shell as code. The
     * page records the write only after it really succeeded.
     */
    private fun runAdd() {
        val spec = selectedAgent()
        val java = javaPath() ?: return
        val server = serverPath() ?: return
        when (val route = spec.mcp) {
            McpRoute.AddCommand ->
                startCommand(spec, AgentMcp.addCommand(spec, java, server, addProgram(spec)).orEmpty())
            is McpRoute.UserFile -> finishAdd(spec, writeFile(route.path, AgentMcp.userFile(spec, java, server).orEmpty()))
            else -> finishAdd(spec, "This agent needs no write.")
        }
    }

    /**
     * The launcher that a press on Add starts. The command field of this page wins, and
     * the path of the search stands in when the field holds the bare name alone.
     */
    private fun addProgram(spec: AgentSpec): String =
        AgentMcp.program(spec, command.text, AgentScan.getInstance().latest().of(spec.id).path)

    /**
     * Runs the command on a pooled thread, because a command can ask for input.
     *
     * The button goes off for the whole run, so one press starts one command. The line
     * under the button says that the page waits.
     */
    private fun startCommand(spec: AgentSpec, parts: List<String>) {
        if (parts.isEmpty()) return finishAdd(spec, "The plugin holds no command for this agent.")
        addServer.isEnabled = false
        addState.text = "The plugin runs the command now. The page waits for the answer."
        ApplicationManager.getApplication().executeOnPooledThread {
            val problem = commandProblem(parts)
            ApplicationManager.getApplication().invokeLater({ finishAdd(spec, problem) }, project.disposed)
        }
    }

    /** Null after a good run, or the text of the problem. */
    private fun commandProblem(parts: List<String>): String? = runCatching {
        val answer = CommandRun.run(parts)
        when {
            answer.timedOut -> "The command gave no answer in time, so the plugin stopped it. It may ask for input."
            answer.ok -> null
            else -> "The command answered: ${answer.output}"
        }
    }.getOrElse { "The command did not run. ${it.message.orEmpty()}" }

    /**
     * Writes what one press on Add gave, and brings the button back.
     *
     * A page that shows another agent now keeps the state of that agent, so a late answer
     * never lands on the line of the wrong agent.
     */
    private fun finishAdd(spec: AgentSpec, problem: String?) {
        if (problem == null) settings().markMcpAdded(spec.id)
        showAdd(selectedAgent())
        if (selectedAgent().id != spec.id) return
        addState.text = problem ?: "The plugin registered the review server for ${spec.label}."
    }

    /** Null after a good write, or the text of the problem. */
    private fun writeFile(relative: String, text: String): String? {
        val base = project.basePath ?: return "This project has no directory."
        return runCatching {
            val file = Path.of(base).resolve(relative)
            Files.createDirectories(file.parent)
            Files.writeString(file, text)
            null
        }.getOrElse { "The file was not written. ${it.message.orEmpty()}" }
    }

    private fun javaPath(): String? = JavaRuntime.locate()

    private fun serverPath(): String? = (ChannelServer.locate() as? ChannelServer.Answer.Found)?.path

    /** A text area, not a label. The help text wraps, and it never renders markup. */
    private fun helpArea() = JBTextArea().apply {
        isEditable = false
        isOpaque = false
        isFocusable = false
        lineWrap = true
        wrapStyleWord = true
        font = JBUI.Fonts.label()
        border = JBUI.Borders.empty(4, 8)
    }

    /** The switch is the only control of the channel, so this text carries the machine state. */
    private fun channelHelp(): String {
        val found = JavaRuntime.locate()
            ?.let { "This IDE runs the server with the Java at $it." }
            ?: "This IDE names no Java runtime, so a session starts without the channel."
        return HandoffPlace.FILES_TEXT + " " +
            "The channel decides only whether the tasks also reach a running session at once. " +
            "With the channel off, the plugin opens no port, and the send copies the prompt to the clipboard. " +
            "The plugin ships the channel server, and the Java runtime of the IDE runs it. $found"
    }

    private fun selected(): CommentSharing = choice.selectedItem as? CommentSharing ?: CommentSharing.LOCAL_ONLY

    private fun shown(): Boolean = settings().sessionWindowShown()

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)
}
