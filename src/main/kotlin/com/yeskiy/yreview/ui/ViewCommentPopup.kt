package com.yeskiy.yreview.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.JBLabel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.yeskiy.yreview.store.StoredComment
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.GridLayout
import javax.swing.JButton
import javax.swing.JPanel

/** The floating box that reads back one stored comment and offers the resolve control. */
object ViewCommentPopup {

    private const val TITLE = "Review Comment"

    /** One comment opens at once. Several comments of the same line open a chooser first. */
    fun show(project: Project, root: VirtualFile, point: RelativePoint, comments: List<StoredComment>) {
        val single = comments.singleOrNull()
        if (single != null) {
            open(project, root, point, single)
            return
        }
        JBPopupFactory.getInstance()
            .createPopupChooserBuilder(comments)
            .setTitle("Review Comments")
            .setRenderer(textListCellRenderer<StoredComment> { CommentText.summary(it) })
            .setItemChosenCallback { open(project, root, point, it) }
            .createPopup()
            .show(point)
    }

    private fun open(project: Project, root: VirtualFile, point: RelativePoint, stored: StoredComment) {
        val body = CommentField(project)
        body.isViewer = true
        body.text = stored.comment.description.orEmpty()

        val resolveButton = JButton("Resolve")
        val closeButton = JButton("Close")

        val panel = JPanel(BorderLayout(0, JBUI.scale(8)))
        panel.border = JBUI.Borders.empty(8)
        panel.add(head(stored), BorderLayout.NORTH)
        panel.add(body, BorderLayout.CENTER)
        panel.add(ReviewPopup.buttons(resolveButton, closeButton), BorderLayout.SOUTH)

        val popup = ReviewPopup.build(panel, body, TITLE, Dimension(JBUI.scale(420), JBUI.scale(200)))
        resolveButton.addActionListener {
            popup.closeOk(null)
            CommentResolve.run(project, root, stored)
        }
        closeButton.addActionListener { popup.cancel() }
        popup.show(point)
    }

    private fun head(stored: StoredComment): JPanel =
        JPanel(GridLayout(2, 1)).also { column ->
            column.add(line(CommentText.location(stored)))
            column.add(line(CommentText.signature(stored)))
        }

    private fun line(text: String): JBLabel =
        JBLabel(text, UIUtil.ComponentStyle.SMALL, UIUtil.FontColor.BRIGHTER)
}
