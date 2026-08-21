package com.yeskiy.yreview.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.ShortcutSet
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBFont
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.StoredComment
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.LayoutManager
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JSeparator

/**
 * The box that reads the review comments of one line back.
 *
 * The editor holds this box under the commented lines, in place of a floating window. The box
 * carries the same words as the hover card of the gutter icon. A rule divides two comments.
 */
object ReadBox {

    /**
     * Builds the card that the file editor shows, inside the frame that keeps the card narrow.
     * A handler carries its own button, and a null handler leaves that button out.
     *
     * One comment keeps every button in one row at the foot of the card. Several comments give
     * each block the buttons of its own comment, and the foot of the card then holds Close
     * alone, because Close acts on the card and the other buttons act on one comment.
     */
    fun build(
        project: Project,
        comments: List<StoredComment>,
        resolve: ((StoredComment) -> Unit)?,
        delete: ((StoredComment) -> Unit)?,
        close: (() -> Unit)?,
    ): JComponent = CardHost(card(project, comments, resolve, delete, close))

    /** Builds the card that the preview pane shows. That pane reads a comment back and writes nothing. */
    fun preview(project: Project, comments: List<StoredComment>): JComponent =
        card(project, comments, null, null, null)

    /** Ties the Delete key of the keymap to [run] while the focus stays inside [card]. */
    fun bindDelete(card: JComponent, parent: Disposable, run: () -> Unit) {
        DumbAwareAction.create { run() }.registerCustomShortcutSet(CommonShortcuts.getDelete(), card, parent)
    }

    private fun card(
        project: Project,
        comments: List<StoredComment>,
        resolve: ((StoredComment) -> Unit)?,
        delete: ((StoredComment) -> Unit)?,
        close: (() -> Unit)?,
    ): JPanel {
        val alone = comments.singleOrNull()
        val column = JPanel().also { it.layout = BoxLayout(it, BoxLayout.Y_AXIS) }
        column.isOpaque = false
        comments.forEachIndexed { index, stored ->
            if (index > 0) column.add(JSeparator())
            column.add(block(project, stored, resolve.takeIf { alone == null }, delete.takeIf { alone == null }))
        }
        return BoxParts.card(BorderLayout(0, JBUI.scale(8))).also { card ->
            card.add(column, BorderLayout.CENTER)
            BoxParts.row(buttons(alone, resolve, delete) + listOfNotNull(close?.let { closeButton(it) }))
                ?.let { card.add(it, BorderLayout.SOUTH) }
        }
    }

    /** The buttons of one comment. The list is empty while the card holds more than one comment. */
    private fun buttons(
        stored: StoredComment?,
        resolve: ((StoredComment) -> Unit)?,
        delete: ((StoredComment) -> Unit)?,
    ): List<JButton> =
        if (stored == null) emptyList()
        else listOfNotNull(
            resolve?.let { resolveButton(stored, it) },
            delete?.let { deleteButton(stored, it) },
        )

    private fun closeButton(close: () -> Unit): JButton =
        JButton("Close").also { button -> button.addActionListener { close() } }

    private fun resolveButton(stored: StoredComment, resolve: (StoredComment) -> Unit): JButton =
        JButton("Resolve").also { button ->
            button.isEnabled = stored.comment.resolved != true
            button.addActionListener { resolve(stored) }
        }

    private fun deleteButton(stored: StoredComment, delete: (StoredComment) -> Unit): JButton =
        JButton("Delete").also { button ->
            button.toolTipText = "Remove this comment from the git notes. You cannot put it back."
            button.addActionListener { delete(stored) }
        }

    private fun block(
        project: Project,
        stored: StoredComment,
        resolve: ((StoredComment) -> Unit)?,
        delete: ((StoredComment) -> Unit)?,
    ): JPanel {
        val body = CommentField(project)
        body.isViewer = true
        body.text = stored.comment.description?.trim().orEmpty().ifEmpty { CommentCard.NO_TEXT }

        return JPanel(BorderLayout(0, JBUI.scale(6))).also { panel ->
            panel.isOpaque = false
            panel.add(head(stored), BorderLayout.NORTH)
            panel.add(body, BorderLayout.CENTER)
            BoxParts.row(buttons(stored, resolve, delete))?.let { panel.add(it, BorderLayout.SOUTH) }
        }
    }

    private fun head(stored: StoredComment): JComponent =
        JPanel(BorderLayout(0, JBUI.scale(2))).also {
            it.isOpaque = false
            it.add(nameLine(stored), BorderLayout.NORTH)
            it.add(BoxParts.small(CommentCard.state(stored)), BorderLayout.SOUTH)
        }

    private fun nameLine(stored: StoredComment): JComponent =
        JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(8), 0)).also {
            it.isOpaque = false
            it.add(JBLabel(stored.comment.author).also { name -> name.font = JBFont.label().asBold() })
            it.add(BoxParts.small(CommentTime.label(stored.comment)))
        }
}

/**
 * The box that writes a new review comment.
 *
 * The editor holds this box under the selected lines. [bind] ties the keys and the growth of
 * the text box to the inlay that carries it, so both end when the box closes.
 */
class WriteBox(
    project: Project,
    header: String,
    private val close: () -> Unit,
    private val save: (String, Boolean) -> Unit,
) {

    private val area = CommentField(project, MIN_HEIGHT).also { it.setPlaceholder(PLACEHOLDER) }

    private val share = JBCheckBox(
        "Share this comment with the remote",
        ReviewSettings.getInstance(project).sharing.shareByDefault,
    ).also {
        it.toolTipText = "The plugin pushes a shared comment to origin. " +
            "A comment that you do not share stays in this repository."
    }

    private val error = BoxParts.small("").also {
        it.foreground = JBColor.RED
        it.isVisible = false
    }

    val panel: JPanel = BoxParts.card(BorderLayout(0, JBUI.scale(8))).also {
        it.add(BoxParts.small(header), BorderLayout.NORTH)
        it.add(area, BorderLayout.CENTER)
        it.add(foot(), BorderLayout.SOUTH)
    }

    /** Ties the keys and the growth of the text box to [inlay], then takes the focus. */
    fun bind(inlay: Inlay<*>) {
        register(CommonShortcuts.getCtrlEnter(), inlay) { commit() }
        register(CommonShortcuts.ESCAPE, inlay) { close() }
        area.document.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) = grow(inlay)
            },
            inlay,
        )
        ApplicationManager.getApplication().invokeLater { area.requestFocusInWindow() }
    }

    private fun foot(): JPanel {
        val saveButton = JButton("Save")
        saveButton.addActionListener { commit() }
        val closeButton = JButton("Close")
        closeButton.addActionListener { close() }
        return JPanel(BorderLayout(0, JBUI.scale(6))).also {
            it.isOpaque = false
            it.add(error, BorderLayout.NORTH)
            it.add(share, BorderLayout.CENTER)
            it.add(BoxParts.row(saveButton, closeButton), BorderLayout.SOUTH)
        }
    }

    private fun register(keys: ShortcutSet, parent: Disposable, run: () -> Unit) {
        DumbAwareAction.create { run() }.registerCustomShortcutSet(keys, panel, parent)
    }

    /** The box follows the text of the user, and the editor moves the lines under it. */
    private fun grow(inlay: Inlay<*>) {
        panel.revalidate()
        if (inlay.isValid) inlay.update()
    }

    private fun commit() {
        val text = area.text.trim()
        val message = CommentText.errorOf(text)
        if (message != null) {
            error.text = message
            error.isVisible = true
            panel.revalidate()
            return
        }
        save(text, share.isSelected)
    }

    private companion object {

        const val MIN_HEIGHT = 96

        const val PLACEHOLDER = "Write the comment. This box reads Markdown."
    }
}

/** The parts that both boxes share, so the two boxes look like one family. */
private object BoxParts {

    fun card(layout: LayoutManager): JPanel =
        JPanel(layout).also {
            it.background = UIUtil.getPanelBackground()
            it.border = JBUI.Borders.compound(
                JBUI.Borders.empty(4, 0),
                JBUI.Borders.customLine(JBColor.border(), 1),
                JBUI.Borders.empty(8),
            )
        }

    fun row(vararg controls: JButton): JPanel =
        JPanel(FlowLayout(FlowLayout.RIGHT, JBUI.scale(8), 0)).also { line ->
            line.isOpaque = false
            controls.forEach { line.add(it) }
        }

    /** The same row of controls, and null while the list holds no control at all. */
    fun row(controls: List<JButton>): JPanel? =
        controls.takeIf { it.isNotEmpty() }?.let { row(*it.toTypedArray()) }

    fun small(text: String): JBLabel =
        JBLabel(text, UIUtil.ComponentStyle.SMALL, UIUtil.FontColor.BRIGHTER)
}

/**
 * The frame of one card in the file editor.
 *
 * The editor gives a block inlay the width of its own view, and the frame takes that width. The
 * frame paints nothing, and it keeps the card at the width that the text of the card asks for.
 * A view that is narrower than the card cuts no button, because the card then takes the width
 * that is left.
 */
private class CardHost(private val card: JComponent) : JPanel() {

    init {
        layout = null
        isOpaque = false
        add(card)
    }

    override fun doLayout() = card.setBounds(0, 0, card.preferredSize.width.coerceAtMost(width), height)

    override fun getPreferredSize(): Dimension = card.preferredSize

    override fun getMinimumSize(): Dimension = card.minimumSize
}
