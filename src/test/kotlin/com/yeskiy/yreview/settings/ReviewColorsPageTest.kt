package com.yeskiy.yreview.settings

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.util.JDOMUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.ui.ReviewColors
import java.awt.Color

/** The color page and the default colors of the overlap and outdated keys. */
class ReviewColorsPageTest : BasePlatformTestCase() {

    fun `test the page lists the three keys and shows them in the demo`() {
        val page = ReviewColorsPage()
        val tags = page.additionalHighlightingTagToDescriptorMap

        assertEquals(
            listOf(ReviewColors.COMMENT_RANGE, ReviewColors.COMMENT_OVERLAP, ReviewColors.COMMENT_OUTDATED),
            page.attributeDescriptors.map { it.key },
        )
        assertTrue(tags.keys.all { page.demoText.contains("<$it>") })
        assertEquals(ReviewColors.COMMENT_OVERLAP, tags["overlap"])
        assertEquals(ReviewColors.COMMENT_OUTDATED, tags["outdated"])
        assertTrue(page.demoText.contains("<outdated>"))
    }

    fun `test the dark scheme gives the outdated key a background`() {
        val scheme = EditorColorsManager.getInstance().getScheme("Darcula")!!

        assertEquals(Color(0x3A, 0x3D, 0x41), scheme.getAttributes(ReviewColors.COMMENT_OUTDATED).backgroundColor)
    }

    fun `test the dark scheme paints the overlap amber`() {
        val scheme = EditorColorsManager.getInstance().getScheme("Darcula")!!

        assertEquals(Color(0x52, 0x43, 0x1B), scheme.getAttributes(ReviewColors.COMMENT_OVERLAP).backgroundColor)
    }

    fun `test the high contrast scheme draws a box around the overlap`() {
        assertEquals(EffectType.BOXED to Color(0xFF, 0xC8, 0x00), highContrast("Y_REVIEW_COMMENT_OVERLAP"))
    }

    fun `test the high contrast scheme draws a dotted line under the outdated lines`() {
        assertEquals(EffectType.BOLD_DOTTED_LINE to Color(0x80, 0x80, 0x80), highContrast("Y_REVIEW_COMMENT_OUTDATED"))
    }

    private fun highContrast(key: String): Pair<EffectType?, Color?> {
        val list = JDOMUtil.load(javaClass.getResourceAsStream("/colorSchemes/YReviewHighContrast.xml")!!)
        val option = list.getChildren("option").single { it.getAttributeValue("name") == key }
        val attributes = TextAttributes(option.getChild("value")!!)
        return attributes.effectType to attributes.effectColor
    }
}
