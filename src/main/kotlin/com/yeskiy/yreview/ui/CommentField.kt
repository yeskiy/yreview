package com.yeskiy.yreview.ui

import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.fileTypes.FileTypeRegistry
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.util.ui.JBUI
import java.awt.Dimension

/**
 * The text box of a review comment. The box reads the text as Markdown, so a heading, a list
 * and a code fence carry the colors of the editor. The Markdown plugin is optional. Without
 * that plugin the box keeps the text as plain text.
 */
class CommentField(project: Project) : EditorTextField(project, markdownOrPlainText()) {

    init {
        setOneLineMode(false)
        setShowPlaceholderWhenFocused(true)
        addSettingsProvider { editor ->
            editor.settings.isUseSoftWraps = true
            editor.setVerticalScrollbarVisible(true)
        }
    }

    /**
     * The box grows with the text of the user. [MAX_HEIGHT] stops the growth, and the editor
     * scrolls after that point. A call to setPreferredSize would end the growth, because the
     * parent class then returns the fixed value and never measures the text.
     */
    override fun getPreferredSize(): Dimension =
        super.getPreferredSize().let { Dimension(it.width, minOf(it.height, JBUI.scale(MAX_HEIGHT))) }

    private companion object {

        const val MAX_HEIGHT = 320

        /** The registry answers UNKNOWN when no plugin claims the extension. */
        fun markdownOrPlainText(): FileType =
            FileTypeRegistry.getInstance().getFileTypeByExtension("md")
                .takeIf { it != FileTypes.UNKNOWN } ?: FileTypes.PLAIN_TEXT
    }
}
