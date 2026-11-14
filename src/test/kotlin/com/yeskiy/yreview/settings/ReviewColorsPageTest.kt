package com.yeskiy.yreview.settings

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.util.JDOMUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.ui.ReviewColors
import java.awt.Color

/** The color page and the default colors of the overlap key. */
class ReviewColorsPageTest : BasePlatformTestCase() {

    fun `test the page lists both keys and shows them in the demo`() {
        val page = ReviewColorsPage()
        val tags = page.additionalHighlightingTagToDescriptorMap

        assertEquals(
            listOf(ReviewColors.COMMENT_RANGE, ReviewColors.COMMENT_OVERLAP),
            page.attributeDescriptors.map { it.key },
        )
        assertTrue(tags.keys.all { page.demoText.contains("<$it>") })
        assertEquals(ReviewColors.COMMENT_OVERLAP, tags["overlap"])
    }

    fun `test the dark scheme paints the overlap amber`() {
        val scheme = EditorColorsManager.getInstance().getScheme("Darcula")!!

        assertEquals(Color(0x52, 0x43, 0x1B), scheme.getAttributes(ReviewColors.COMMENT_OVERLAP).backgroundColor)
    }

    fun `test the high contrast scheme draws a box around the overlap`() {
        val list = JDOMUtil.load(javaClass.getResourceAsStream("/colorSchemes/YReviewHighContrast.xml")!!)
        val attributes = TextAttributes(list.getChild("option")!!.getChild("value")!!)

        assertEquals(EffectType.BOXED to Color(0xFF, 0xC8, 0x00), attributes.effectType to attributes.effectColor)
    }
}
