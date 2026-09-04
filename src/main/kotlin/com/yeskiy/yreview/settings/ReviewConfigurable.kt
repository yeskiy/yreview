package com.yeskiy.yreview.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.intellij.util.ui.JBUI
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.gutter.CommentGutter
import com.yeskiy.yreview.session.ClaudeCommand
import com.yeskiy.yreview.session.ClaudeDetection
import com.yeskiy.yreview.session.JavaRuntime
import com.yeskiy.yreview.store.NotesSharing
import java.awt.Font
import javax.swing.JComponent

class ReviewConfigurable(private val project: Project) : Configurable {

    private val choice = ComboBox(CommentSharing.entries.toTypedArray())

    private val channel = JBCheckBox("Send the review tasks through the channel")

    private val sessionWindow = JBCheckBox("Show the Claude tool window")

    private val maximize = JBCheckBox("Hide the editor beside a maximized tool window")

    private val command = JBTextField()

    private val remote = JBTextField()

    private val refspec = JBCheckBox("Add the notes refspec to the git configuration")

    private val editorMarks = JBCheckBox("Show comment marks in the editor")

    private val autoStart = JBCheckBox("Start a session when the session tool window opens")

    override fun getDisplayName(): String = ProductName.TEXT

    override fun createComponent(): JComponent {
        choice.renderer = textListCellRenderer<CommentSharing> { it.label }
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
                    "The Claude tool window runs the review sessions inside the IDE. " +
                        "The plus button in the title bar opens one more session in a tab of its own. " +
                        "A close of the tab ends the session and the process behind it. " +
                        "The Send button of the review window names the session that gets the tasks. " +
                        "It asks for one while two or more sessions read the comment channel. " +
                        "The switch starts off when this machine holds no Claude Code installation. " +
                        "The window appears and disappears at once, so no restart is needed."
                )
            }
            row("Claude command:") {
                cell(command).align(AlignX.FILL)
            }
            row {
                comment(commandHelp())
            }
            row {
                cell(appendedArguments()).align(AlignX.FILL)
            }
            row {
                comment(
                    "The plugin appends these arguments to the command above. " +
                        "It appends them only when the bridge answers and the channel can run. " +
                        "An entry in a configuration file alone never registers a channel."
                )
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
            command.text.trim() != settings().claudeCommand ||
            remote.text.trim() != settings().remote ||
            refspec.isSelected != settings().writeRefspec ||
            editorMarks.isSelected != settings().editorMarks ||
            autoStart.isSelected != settings().autoStartSession

    override fun apply() {
        settings().sharing = selected()
        settings().channel = channel.isSelected
        settings().sessionWindow = sessionWindow.isSelected
        settings().claudeCommand = command.text
        settings().remote = remote.text
        settings().writeRefspec = refspec.isSelected
        settings().editorMarks = editorMarks.isSelected
        settings().autoStartSession = autoStart.isSelected
        command.text = settings().claudeCommand
        remote.text = settings().remote
        BridgeService.getInstance(project).applySwitch(channel.isSelected)
        SessionWindow.show(project, sessionWindow.isSelected)
        MaximizeSettings.getInstance().switch(maximize.isSelected)
        CommentGutter.getInstance(project).applyMarkSwitch(editorMarks.isSelected)
    }

    override fun reset() {
        choice.selectedItem = settings().sharing
        channel.isSelected = settings().channel
        sessionWindow.isSelected = shown()
        maximize.isSelected = MaximizeSettings.getInstance().full
        command.text = settings().claudeCommand
        remote.text = settings().remote
        refspec.isSelected = settings().writeRefspec
        editorMarks.isSelected = settings().editorMarks
        autoStart.isSelected = settings().autoStartSession
    }

    /** The real strings, so a user reads what the session runs and not a description of it. */
    private fun appendedArguments() = JBTextArea(ARGUMENTS).apply {
        isEditable = false
        isOpaque = false
        lineWrap = false
        font = JBUI.Fonts.create(Font.MONOSPACED, JBUI.Fonts.label().size)
        border = JBUI.Borders.empty(4, 8)
    }

    /** The switch is the only control of the channel, so this text carries the machine state. */
    private fun channelHelp(): String {
        val found = JavaRuntime.locate()
            ?.let { "This IDE runs the server with the Java at $it." }
            ?: "This IDE names no Java runtime, so a session starts without the channel."
        return "The channel pushes a task to a running Claude Code session at once. " +
            "With the channel off, the plugin opens no port. " +
            "Every send then writes AGENT.md and tasks.json in .git/y-review, " +
            "and it copies the prompt to the clipboard. " +
            "The plugin ships the channel server, and the Java runtime of the IDE runs it. $found"
    }

    private fun commandHelp(): String {
        val install = ClaudeDetection.getInstance().install()
        val found = install.path
            ?.let { "This machine holds Claude Code at $it, so that path also works here." }
            ?: "No Claude Code installation was found on this machine."
        return "A shell runs this one command, and the shell loads the profile of the user. " +
            "Paste a full path when the command is not on the PATH. $found"
    }

    private fun selected(): CommentSharing = choice.selectedItem as? CommentSharing ?: CommentSharing.LOCAL_ONLY

    private fun shown(): Boolean =
        settings().sessionWindowShown(ClaudeDetection.getInstance().install().found)

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)

    private companion object {
        val ARGUMENTS = ClaudeCommand.CONFIG_FLAG + " <the configuration file of the session>\n" +
            ClaudeCommand.CHANNEL_FLAG + " " + ClaudeCommand.CHANNEL_VALUE
    }
}
