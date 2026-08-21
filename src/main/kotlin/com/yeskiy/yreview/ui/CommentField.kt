package com.yeskiy.yreview.ui

import com.intellij.openapi.application.WriteIntentReadAction
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.fileTypes.FileTypeRegistry
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.util.ui.JBUI
import java.awt.Dimension
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent

/**
 * The text box of a review comment. The box reads the text as Markdown, so a heading, a list
 * and a code fence carry the colors of the editor. The Markdown plugin is optional. Without
 * that plugin the box keeps the text as plain text.
 *
 * [minHeight] holds the box open when it carries no text yet. A box that reads a comment back
 * keeps the default value, so a comment of one line takes one line.
 */
class CommentField(project: Project, private val minHeight: Int = 0) :
    EditorTextField(project, markdownOrPlainText()) {

    /** The width that the lines of the box follow at this moment. */
    private var wrappedWidth = 0

    init {
        setOneLineMode(false)
        setShowPlaceholderWhenFocused(true)
        addSettingsProvider { editor ->
            editor.settings.isUseSoftWraps = true
            editor.setVerticalScrollbarVisible(true)
            editor.setHorizontalScrollbarVisible(false)
        }
        addComponentListener(
            object : ComponentAdapter() {
                override fun componentResized(event: ComponentEvent) = wrapToWidth()
            },
        )
    }

    /**
     * The box grows with the text of the user. [MAX_HEIGHT] stops the growth, and the editor
     * scrolls after that point. A call to setPreferredSize would end the growth, because the
     * parent class then returns the fixed value and never measures the text.
     *
     * The width comes from the box, and never from the text. The parent class answers with the
     * width of the longest line of the editor. A host that reads that answer then holds the box
     * open at the width of that line, and no line of the text ever wraps. [START_WIDTH] answers
     * for a box that no host measured yet.
     */
    override fun getPreferredSize(): Dimension =
        Dimension(
            width.takeIf { it > 0 } ?: JBUI.scale(START_WIDTH),
            super.getPreferredSize().height.coerceIn(JBUI.scale(minHeight), JBUI.scale(MAX_HEIGHT)),
        )

    /**
     * Breaks the lines of the text again for a new width of the box.
     *
     * The editor breaks a long line at the width of its own view, and it keeps the width that
     * it read first. The mark on the soft wrap setting goes down and up again, so the editor
     * reads the width of the wider or narrower box and breaks the lines a second time. The box
     * then asks its host for a new height, because the new lines need more rows.
     *
     * A box that only reads a comment back also returns to the first column. That box carries
     * no caret, so nothing else moves the view, and the first word of the text stays in sight.
     */
    private fun wrapToWidth() {
        val editor = this.editor ?: return
        if (width <= 0 || width == wrappedWidth) return
        wrappedWidth = width
        WriteIntentReadAction.run {
            editor.settings.isUseSoftWraps = false
            editor.settings.isUseSoftWraps = true
            if (isViewer) editor.scrollingModel.scrollHorizontally(0)
        }
        revalidate()
    }

    private companion object {

        const val MAX_HEIGHT = 320

        const val START_WIDTH = 420

        /** The registry answers UNKNOWN when no plugin claims the extension. */
        fun markdownOrPlainText(): FileType =
            FileTypeRegistry.getInstance().getFileTypeByExtension("md")
                .takeIf { it != FileTypes.UNKNOWN } ?: FileTypes.PLAIN_TEXT
    }
}
