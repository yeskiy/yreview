package com.yeskiy.yreview.diff

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class FakeFacts(
    private val before: Pair<String, String>? = null,
    private val after: Pair<String, String>? = null,
    private val working: String? = after?.second,
    private val headValue: String? = null,
) : RevisionFacts {
    override fun beforeRevision() = before
    override fun afterRevision() = after
    override fun afterPath() = working
    override fun head() = headValue
}

class DiffAnchorResolverTest {

    @Test
    fun `the left side takes the before revision`() {
        val facts = FakeFacts(before = "4f2c8b1" to "a.kt", after = "9de1122" to "a.kt")
        val anchor = DiffAnchorResolver.resolve(facts, DiffSide.LEFT)!!
        assertEquals("4f2c8b1", anchor.commit)
        assertEquals("a.kt", anchor.path)
        assertEquals(false, anchor.dirty)
    }

    @Test
    fun `the right side takes the after revision`() {
        val facts = FakeFacts(before = "4f2c8b1" to "a.kt", after = "9de1122" to "a.kt")
        val anchor = DiffAnchorResolver.resolve(facts, DiffSide.RIGHT)!!
        assertEquals("9de1122", anchor.commit)
        assertEquals(false, anchor.dirty)
    }

    @Test
    fun `a renamed file keeps the path of its own side`() {
        val facts = FakeFacts(before = "4f2c8b1" to "old.kt", after = "9de1122" to "new.kt")
        assertEquals("old.kt", DiffAnchorResolver.resolve(facts, DiffSide.LEFT)!!.path)
        assertEquals("new.kt", DiffAnchorResolver.resolve(facts, DiffSide.RIGHT)!!.path)
    }

    @Test
    fun `the working tree side falls back to head and is marked dirty`() {
        val facts = FakeFacts(before = "4f2c8b1" to "a.kt", after = null, headValue = "9de1122")
        val anchor = DiffAnchorResolver.resolve(facts, DiffSide.RIGHT)!!
        assertEquals("9de1122", anchor.commit)
        assertTrue(anchor.dirty)
        assertEquals("a.kt", anchor.path)
    }

    @Test
    fun `a new file has no left anchor`() {
        val facts = FakeFacts(before = null, after = "9de1122" to "a.kt", headValue = "9de1122")
        assertNull(DiffAnchorResolver.resolve(facts, DiffSide.LEFT))
    }

    @Test
    fun `a file that git does not track yet anchors the right side at head`() {
        val facts = FakeFacts(before = null, after = null, working = "new.kt", headValue = "9de1122")
        val anchor = DiffAnchorResolver.resolve(facts, DiffSide.RIGHT)!!

        assertEquals("9de1122", anchor.commit)
        assertEquals("new.kt", anchor.path)
        assertTrue(anchor.dirty)
    }

    @Test
    fun `a file that git does not track yet still has no left anchor`() {
        val facts = FakeFacts(before = null, after = null, working = "new.kt", headValue = "9de1122")

        assertNull(DiffAnchorResolver.resolve(facts, DiffSide.LEFT))
    }

    @Test
    fun `a diff with no revision at all has no anchor`() {
        val facts = FakeFacts()
        assertNull(DiffAnchorResolver.resolve(facts, DiffSide.LEFT))
        assertNull(DiffAnchorResolver.resolve(facts, DiffSide.RIGHT))
    }
}
