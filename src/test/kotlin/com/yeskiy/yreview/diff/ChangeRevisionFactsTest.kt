package com.yeskiy.yreview.diff

import com.intellij.openapi.vcs.LocalFilePath
import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.CurrentContentRevision
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The facts of a file that git does not track yet.
 *
 * The diff of the local changes hands the plugin a working tree revision, and such a
 * revision reports a blank revision number. A fake revision would prove none of that, so
 * these tests build the change out of the classes of the platform.
 */
class ChangeRevisionFactsTest {

    private val root = "E:/work/api"

    private val head = "9de1122"

    private fun added(path: String): Change = Change(null, CurrentContentRevision(LocalFilePath(path, false)))

    @Test
    fun `a working tree revision reports a blank revision number`() {
        val revision = CurrentContentRevision(LocalFilePath("$root/new.kt", false))

        assertTrue(revision.revisionNumber.asString().isBlank(), revision.revisionNumber.asString())
    }

    @Test
    fun `an added file holds no revision pair on either side`() {
        val facts = ChangeRevisionFacts(added("$root/new.kt"), head, root)

        assertNull(facts.beforeRevision())
        assertNull(facts.afterRevision())
    }

    @Test
    fun `an added file still names the path of the right side`() {
        assertEquals("new.kt", ChangeRevisionFacts(added("$root/new.kt"), head, root).afterPath())
    }

    @Test
    fun `a file outside the repository names no path`() {
        assertNull(ChangeRevisionFacts(added("E:/other/new.kt"), head, root).afterPath())
    }

    @Test
    fun `the diff of an added file takes a comment on the right side`() {
        val facts = ChangeRevisionFacts(added("$root/new.kt"), head, root)
        val anchor = DiffAnchorResolver.resolve(facts, DiffSide.RIGHT)!!

        assertEquals(head, anchor.commit)
        assertEquals("new.kt", anchor.path)
        assertTrue(anchor.dirty)
    }
}
