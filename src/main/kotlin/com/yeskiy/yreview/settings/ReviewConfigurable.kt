package com.yeskiy.yreview.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.session.ClaudeDetection
import javax.swing.JComponent

class ReviewConfigurable(private val project: Project) : Configurable {

    private val choice = ComboBox(CommentSharing.entries.toTypedArray())

    private val channel = JBCheckBox("Send the review tasks through the channel")

    private val sessionWindow = JBCheckBox("Show the Claude tool window")

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
                comment(
                    "The channel pushes a task to a running Claude Code session at once. " +
                        "With the channel off, the plugin opens no port. " +
                        "Every send then writes AGENT.md and tasks.json in .git/y-review, " +
                        "and it copies the prompt to the clipboard."
                )
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
        }
    }

    override fun isModified(): Boolean =
        selected() != settings().sharing ||
            channel.isSelected != settings().channel ||
            sessionWindow.isSelected != shown()

    override fun apply() {
        settings().sharing = selected()
        settings().channel = channel.isSelected
        settings().sessionWindow = sessionWindow.isSelected
        BridgeService.getInstance(project).applySwitch(channel.isSelected)
        SessionWindow.show(project, sessionWindow.isSelected)
    }

    override fun reset() {
        choice.selectedItem = settings().sharing
        channel.isSelected = settings().channel
        sessionWindow.isSelected = shown()
    }

    private fun selected(): CommentSharing = choice.selectedItem as? CommentSharing ?: CommentSharing.LOCAL_ONLY

    private fun shown(): Boolean =
        settings().sessionWindowShown(ClaudeDetection.getInstance().install().found)

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)
}
