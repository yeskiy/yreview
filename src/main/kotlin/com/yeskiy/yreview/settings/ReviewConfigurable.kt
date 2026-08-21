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
import com.yeskiy.yreview.session.ClaudeCommand
import com.yeskiy.yreview.session.ClaudeDetection
import com.yeskiy.yreview.session.JavaRuntime
import java.awt.Font
import javax.swing.JComponent

class ReviewConfigurable(private val project: Project) : Configurable {

    private val choice = ComboBox(CommentSharing.entries.toTypedArray())

    private val channel = JBCheckBox("Send the review tasks through the channel")

    private val sessionWindow = JBCheckBox("Show the Claude tool window")

    private val command = JBTextField()

    override fun getDisplayName(): String = "Review Comments"

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
                        "to origin. The add-comment dialog can change the choice for one comment."
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
                    "The Claude tool window runs one review session inside the IDE. " +
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
        }
    }

    override fun isModified(): Boolean =
        selected() != settings().sharing ||
            channel.isSelected != settings().channel ||
            sessionWindow.isSelected != shown() ||
            command.text.trim() != settings().claudeCommand

    override fun apply() {
        settings().sharing = selected()
        settings().channel = channel.isSelected
        settings().sessionWindow = sessionWindow.isSelected
        settings().claudeCommand = command.text
        command.text = settings().claudeCommand
        BridgeService.getInstance(project).applySwitch(channel.isSelected)
        SessionWindow.show(project, sessionWindow.isSelected)
    }

    override fun reset() {
        choice.selectedItem = settings().sharing
        channel.isSelected = settings().channel
        sessionWindow.isSelected = shown()
        command.text = settings().claudeCommand
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
