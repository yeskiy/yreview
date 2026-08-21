package com.yeskiy.yreview.settings

import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.PlainSyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.options.colors.AttributesDescriptor
import com.intellij.openapi.options.colors.ColorDescriptor
import com.intellij.openapi.options.colors.ColorSettingsPage
import com.yeskiy.yreview.ui.ReviewColors
import javax.swing.Icon

/** The page under Settings, Editor, Color Scheme that holds the colors of the review marks. */
class ReviewColorsPage : ColorSettingsPage {

    override fun getDisplayName(): String = "Review Comments"

    override fun getIcon(): Icon? = null

    override fun getHighlighter(): SyntaxHighlighter = PlainSyntaxHighlighter()

    override fun getDemoText(): String =
        """
        fun parse(text: String): Result {
        <range>    val trimmed = text.trim()
            return Result(trimmed)</range>
        }
        """.trimIndent()

    override fun getAdditionalHighlightingTagToDescriptorMap(): Map<String, TextAttributesKey> =
        mapOf("range" to ReviewColors.COMMENT_RANGE)

    override fun getAttributeDescriptors(): Array<AttributesDescriptor> =
        arrayOf(AttributesDescriptor("Lines of an open comment", ReviewColors.COMMENT_RANGE))

    override fun getColorDescriptors(): Array<ColorDescriptor> = ColorDescriptor.EMPTY_ARRAY
}
