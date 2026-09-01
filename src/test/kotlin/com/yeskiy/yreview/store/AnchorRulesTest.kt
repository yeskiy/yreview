package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AnchorRulesTest {

    private val base = "E:/Projects/site"

    @Test
    fun `a file under the project directory uses the project directory`() {
        assertEquals(base, AnchorRules.folderRoot("$base/CLAUDE.md", base, listOf("$base/app")))
    }

    @Test
    fun `a deep file under the project directory still uses the project directory`() {
        assertEquals(base, AnchorRules.folderRoot("$base/docs/reviews/one.md", base, emptyList()))
    }

    @Test
    fun `a file outside the project directory uses the innermost content root`() {
        assertEquals(
            "E:/Other/lib/inner",
            AnchorRules.folderRoot("E:/Other/lib/inner/a.kt", base, listOf("E:/Other/lib", "E:/Other/lib/inner")),
        )
    }

    @Test
    fun `a file outside every root has no place`() {
        assertNull(AnchorRules.folderRoot("E:/Elsewhere/a.kt", base, listOf("$base/app")))
    }

    @Test
    fun `a null project directory falls through to the content roots`() {
        assertEquals("$base/app", AnchorRules.folderRoot("$base/app/a.kt", null, listOf("$base/app")))
    }

    @Test
    fun `a sibling folder with a longer name is not inside the root`() {
        assertNull(AnchorRules.folderRoot("E:/Projects/site-two/a.kt", base, emptyList()))
    }

    @Test
    fun `the relative path drops the root and the slash`() {
        assertEquals("docs/one.md", AnchorRules.relative("$base/docs/one.md", base))
    }

    @Test
    fun `the relative path of a file outside the root is null`() {
        assertNull(AnchorRules.relative("E:/Elsewhere/a.kt", base))
    }

    @Test
    fun `the root itself has no relative path`() {
        assertNull(AnchorRules.relative(base, base))
    }
}
