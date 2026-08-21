package com.yeskiy.yreview.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import javax.swing.JComponent

class ReviewConfigurable(private val project: Project) : Configurable {

    private val choice = ComboBox(CommentSharing.entries.toTypedArray())

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
        }
    }

    override fun isModified(): Boolean = selected() != settings().sharing

    override fun apply() {
        settings().sharing = selected()
    }

    override fun reset() {
        choice.selectedItem = settings().sharing
    }

    private fun selected(): CommentSharing = choice.selectedItem as? CommentSharing ?: CommentSharing.LOCAL_ONLY

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)
}
