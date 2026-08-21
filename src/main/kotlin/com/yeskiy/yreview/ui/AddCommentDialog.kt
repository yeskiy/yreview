package com.yeskiy.yreview.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JComponent
import javax.swing.JPanel

class AddCommentDialog(
    project: Project,
    private val header: String,
    shareByDefault: Boolean,
) : DialogWrapper(project) {

    private val area = JBTextArea(6, 60)
    private val shareBox = JBCheckBox("Share this comment with the remote", shareByDefault)

    init {
        title = "Add Review Comment"
        shareBox.toolTipText = "The plugin pushes a shared comment to origin. " +
            "A comment that you do not share stays in this repository."
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout(0, 8))
        panel.add(JBLabel(header), BorderLayout.NORTH)
        panel.add(JBScrollPane(area), BorderLayout.CENTER)
        panel.add(shareBox, BorderLayout.SOUTH)
        panel.preferredSize = Dimension(640, 250)
        return panel
    }

    override fun getPreferredFocusedComponent(): JComponent = area

    override fun doValidate(): ValidationInfo? =
        if (area.text.isBlank()) ValidationInfo("Write the comment first.", area) else null

    val text: String get() = area.text.trim()

    val share: Boolean get() = shareBox.isSelected
}
