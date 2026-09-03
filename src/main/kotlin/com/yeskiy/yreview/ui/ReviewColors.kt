package com.yeskiy.yreview.ui

import com.intellij.openapi.editor.colors.EditorColors
import com.intellij.openapi.editor.colors.TextAttributesKey

/**
 * The colors of the review marks. Every color comes from the color scheme of the IDE, so a new
 * theme repaints the marks. The user sets another color in Settings, Editor, Color Scheme,
 * Yreview.
 */
object ReviewColors {

    /**
     * The lines that an open comment covers. Without a value of its own the key takes the color
     * of an injected fragment. That color is a quiet background, and every scheme carries it.
     */
    val COMMENT_RANGE: TextAttributesKey =
        TextAttributesKey.createTextAttributesKey("Y_REVIEW_COMMENT_RANGE", EditorColors.INJECTED_LANGUAGE_FRAGMENT)
}
