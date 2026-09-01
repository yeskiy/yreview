package com.yeskiy.yreview.action

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.TextEditor

/**
 * The editor that one action of the editor menu writes a comment in.
 *
 * A data context names the editor only while the caret sits in a text editor. A markdown file
 * always opens in a split editor, and the preview side of that editor holds no editor of its
 * own. The context therefore names no editor while the preview holds the focus. The file
 * editor of the tab still answers there, and a split editor gives its text side through that
 * answer.
 *
 * The text side answers in every layout, and a hidden text side answers too. [CommentPlace]
 * reads the layout and names the place of the box.
 */
object EditorPick {

    /**
     * The rule of the pick. The direct answer wins, and the tab answers next.
     *
     * The rule reads plain values, so a test runs it without a running IDE.
     */
    fun <E : Any, F : Any> pick(direct: E?, tab: F?, textSide: (F) -> E?): E? =
        direct ?: tab?.let(textSide)

    /** The editor of [event], through the context first and through the file editor second. */
    fun of(event: AnActionEvent): Editor? = pick(
        event.getData(CommonDataKeys.EDITOR),
        event.getData(PlatformCoreDataKeys.FILE_EDITOR),
    ) { (it as? TextEditor)?.editor }
}
