package com.yeskiy.yreview.ui

import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.yeskiy.yreview.settings.ReviewSettings
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JButton
import javax.swing.JPanel

/** The floating box that takes a new review comment. */
object AddCommentPopup {

    private const val TITLE = "Add Review Comment"

    /**
     * Opens the box beside the selection of the editor. The Save button hands the text and the
     * share choice to [save]. An empty text stays in the box, and the box states the reason.
     */
    fun show(project: Project, editor: Editor, header: String, save: (String, Boolean) -> Unit) {
        val area = JBTextArea(6, 60)
        area.lineWrap = true
        area.wrapStyleWord = true

        val share = JBCheckBox(
            "Share this comment with the remote",
            ReviewSettings.getInstance(project).sharing.shareByDefault,
        )
        share.toolTipText = "The plugin pushes a shared comment to origin. " +
            "A comment that you do not share stays in this repository."

        val error = JBLabel("", UIUtil.ComponentStyle.SMALL, UIUtil.FontColor.NORMAL)
        error.foreground = JBColor.RED
        error.isVisible = false

        val saveButton = JButton("Save")
        val closeButton = JButton("Close")

        val foot = JPanel(BorderLayout(0, JBUI.scale(6)))
        foot.add(error, BorderLayout.NORTH)
        foot.add(share, BorderLayout.CENTER)
        foot.add(ReviewPopup.buttons(saveButton, closeButton), BorderLayout.SOUTH)

        val panel = JPanel(BorderLayout(0, JBUI.scale(8)))
        panel.border = JBUI.Borders.empty(8)
        panel.add(JBLabel(header, UIUtil.ComponentStyle.SMALL, UIUtil.FontColor.BRIGHTER), BorderLayout.NORTH)
        panel.add(JBScrollPane(area), BorderLayout.CENTER)
        panel.add(foot, BorderLayout.SOUTH)

        val popup = ReviewPopup.build(panel, area, TITLE, Dimension(JBUI.scale(420), JBUI.scale(220)))

        fun commit() {
            val text = area.text.trim()
            val message = CommentText.errorOf(text)
            if (message != null) {
                error.text = message
                error.isVisible = true
                panel.revalidate()
                return
            }
            popup.closeOk(null)
            save(text, share.isSelected)
        }

        saveButton.addActionListener { commit() }
        closeButton.addActionListener { popup.cancel() }
        DumbAwareAction.create { commit() }.registerCustomShortcutSet(CommonShortcuts.getCtrlEnter(), panel, popup)
        popup.showInBestPositionFor(editor)
    }
}
