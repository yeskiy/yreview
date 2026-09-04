package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HandoffPromptTest {

    private val commit = "44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900"

    private fun task(id: String, path: String, line: Int) = ReviewTask(
        id = id,
        kind = TaskKind.TODO,
        path = path,
        startLine = line,
        endLine = line,
        text = "TODO: work on $id",
    )

    private val comment = ReviewTask(
        id = "a1b2c3",
        kind = TaskKind.COMMENT,
        path = "src/Parser.kt",
        startLine = 88,
        endLine = 94,
        text = "This reload reads git on the user interface thread.",
    )

    @Test
    fun `names the two files in the first line`() {
        val text = HandoffPrompt.of(".git/y-review", commit, listOf(comment))
        assertEquals(
            "Read .git/y-review/AGENT.md, then work through .git/y-review/tasks.json.",
            text.lineSequence().first(),
        )
    }

    @Test
    fun `counts the tasks and the files in the second line`() {
        val text = HandoffPrompt.of(".git/y-review", commit, listOf(comment, task("t1", "src/A.kt", 4)))
        assertEquals("2 open tasks in 2 files at commit 44787c6.", text.lineSequence().drop(1).first())
    }

    @Test
    fun `counts one task and one file in the singular`() {
        val text = HandoffPrompt.of(".git/y-review", commit, listOf(comment))
        assertEquals("1 open task in 1 file at commit 44787c6.", text.lineSequence().drop(1).first())
    }

    @Test
    fun `counts one file for two tasks of that file`() {
        val text = HandoffPrompt.of(".git/y-review", commit, listOf(task("t1", "src/A.kt", 4), task("t2", "src/A.kt", 9)))
        assertEquals("2 open tasks in 1 file at commit 44787c6.", text.lineSequence().drop(1).first())
    }

    @Test
    fun `carries the whole identifier of every task`() {
        val text = HandoffPrompt.of(".git/y-review", commit, listOf(comment, task("t1", "src/A.kt", 4)))
        assertTrue(text.contains("a1b2c3 comment src/Parser.kt:88-94"), text)
        assertTrue(text.contains("t1 todo src/A.kt:4"), text)
    }

    @Test
    fun `carries the text of every task`() {
        val text = HandoffPrompt.of(".git/y-review", commit, listOf(comment))
        assertTrue(text.contains("This reload reads git on the user interface thread."), text)
    }

    @Test
    fun `a folder store names the counts without a commit`() {
        val text = HandoffPrompt.of(".y-review", FolderStore.WORKTREE, listOf(comment))
        assertEquals("1 open task in 1 file.", text.lineSequence().drop(1).first())
    }

    @Test
    fun `a folder store still names the two files and the tasks`() {
        val text = HandoffPrompt.of(".y-review", FolderStore.WORKTREE, listOf(comment))
        assertEquals(
            "Read .y-review/AGENT.md, then work through .y-review/tasks.json.",
            text.lineSequence().first(),
        )
        assertTrue(text.contains("a1b2c3 comment src/Parser.kt:88-94"), text)
    }

    @Test
    fun `an empty commit names no commit`() {
        val text = HandoffPrompt.of(".y-review", "", listOf(comment))
        assertEquals("1 open task in 1 file.", text.lineSequence().drop(1).first())
    }

    @Test
    fun `names the folder of a worktree in the whole path`() {
        val text = HandoffPrompt.of("E:/main/.git/worktrees/tree/y-review", commit, listOf(comment))
        assertTrue(text.startsWith("Read E:/main/.git/worktrees/tree/y-review/AGENT.md,"), text)
    }
}
