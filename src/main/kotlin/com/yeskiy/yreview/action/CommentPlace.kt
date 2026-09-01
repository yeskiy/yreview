package com.yeskiy.yreview.action

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.fileEditor.TextEditorWithPreview

/** Where the box of a new comment opens. */
enum class BoxPlace {

    /** Under the commented lines, as an inlay of the text editor. */
    EDITOR,

    /** Over the preview, as a floating window. */
    PREVIEW,
}

/**
 * The rule that names the place of the write box.
 *
 * A split editor keeps both sides in the window and hides one of them. While the tab shows
 * the preview alone, the text side is invisible, so a box inside that editor reaches no
 * user. The floating box opens over the preview in that case, and the tab of the user stays
 * as the user set it.
 *
 * The rule reads the platform type of the tab and no type of the Markdown plugin. A tab of
 * any other kind with a preview side therefore follows the same rule.
 */
object CommentPlace {

    /**
     * The rule of the place. A layout that equals [previewOnly] takes the floating box.
     *
     * The rule reads plain values, so a test runs it without a running IDE.
     */
    fun <L : Any> placeOf(layout: L?, previewOnly: L): BoxPlace =
        if (layout == previewOnly) BoxPlace.PREVIEW else BoxPlace.EDITOR

    /** The place for [event], read from the file editor of the tab. */
    fun of(event: AnActionEvent): BoxPlace = placeOf(
        (event.getData(PlatformCoreDataKeys.FILE_EDITOR) as? TextEditorWithPreview)?.getLayout(),
        TextEditorWithPreview.Layout.SHOW_PREVIEW,
    )
}
