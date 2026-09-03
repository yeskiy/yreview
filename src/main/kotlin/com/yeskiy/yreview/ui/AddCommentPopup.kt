package com.yeskiy.yreview.ui

import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
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

    private const val PLACEHOLDER = "Write the comment. This box reads Markdown."

    /**
     * Opens the box beside the selection of the editor. The Save button hands the text and the
     * share choice to [save]. An empty text stays in the box, and the box states the reason.
     *
     * [canPush] is false for a folder store. The box then states that a shared comment reaches
     * the remote only after the comments move into the git notes.
     *
     * [context] opens the box over the component of that context in place of the editor. The
     * preview side of a split editor holds no editor of its own. A hidden text editor gives no
     * point on the screen. The box therefore needs the context there.
     */
    fun show(
        project: Project,
        editor: Editor,
        header: String,
        canPush: Boolean = true,
        context: DataContext? = null,
        save: (String, Boolean) -> Unit,
    ) {
        val area = CommentField(project)
        area.setPlaceholder(PLACEHOLDER)

        val share = JBCheckBox(
            "Share this comment with the remote",
            ReviewSettings.getInstance(project).sharing.shareByDefault,
        )
        share.toolTipText = CommentText.shareTooltip(canPush)

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
        panel.add(area, BorderLayout.CENTER)
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
        area.document.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) = popup.pack(false, true)
            },
            popup,
        )
        DumbAwareAction.create { commit() }.registerCustomShortcutSet(CommonShortcuts.getCtrlEnter(), panel, popup)
        if (context != null) popup.showInBestPositionFor(context) else popup.showInBestPositionFor(editor)
    }
}
