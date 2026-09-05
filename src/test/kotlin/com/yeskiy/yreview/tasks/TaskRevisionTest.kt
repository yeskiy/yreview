package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.FolderStore
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The revision that the tasks of one repository carry.
 *
 * A repository that the user just started has no commit, and it still holds TODO lines. The
 * scan therefore reads such a repository, and it names the working tree.
 */
class TaskRevisionTest {

    private val head = "9f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b706"

    @Test
    fun `a repository with a commit carries that commit`() {
        assertEquals(head, TaskRevision.of(head))
    }

    @Test
    fun `a repository with no commit carries the working tree`() {
        assertEquals(FolderStore.WORKTREE, TaskRevision.of(null))
    }
}
