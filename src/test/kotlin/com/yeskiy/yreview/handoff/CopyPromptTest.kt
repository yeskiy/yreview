package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CopyPromptTest {

    private val apiCommit = "44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900"

    private val webCommit = "9f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b706"

    private val comment = ReviewTask(
        id = "a1b2c3",
        kind = TaskKind.COMMENT,
        path = "src/Parser.kt",
        startLine = 88,
        endLine = 94,
        text = "This reload reads git on the user interface thread.",
    )

    private val todo = ReviewTask(
        id = "todo-0f1e2d3c-12",
        kind = TaskKind.TODO,
        path = "src/Cache.kt",
        startLine = 12,
        endLine = 12,
        text = "TODO: drop the second lookup.",
    )

    private fun api(tasks: List<ReviewTask> = listOf(comment), written: Boolean = true) = PromptFolder(
        store = StoreKind.GIT,
        name = "api",
        root = "E:/work/api",
        done = if (written) "E:/work/api/.git/y-review/done.txt" else "",
        commit = apiCommit,
        tasks = tasks,
        written = written,
    )

    private fun web(tasks: List<ReviewTask> = listOf(todo)) = PromptFolder(
        store = StoreKind.GIT,
        name = "web",
        root = "E:/work/web",
        done = "E:/work/web/.git/y-review/done.txt",
        commit = webCommit,
        tasks = tasks,
        written = true,
    )

    private fun count(text: String, part: String): Int = text.split(part).size - 1

    // --- One folder ---

    @Test
    fun `opens with the title of the rules`() {
        assertEquals(AgentGuide.TITLE, CopyPrompt.of(listOf(api())).lineSequence().first())
    }

    @Test
    fun `counts the tasks and the folders of one group`() {
        val text = CopyPrompt.of(listOf(api()))
        assertTrue(text.contains("You work through 1 open review task in 1 folder."), text)
    }

    @Test
    fun `carries the rules of the agent whole`() {
        assertTrue(CopyPrompt.of(listOf(api())).contains(AgentGuide.RULES))
    }

    @Test
    fun `names the repository the file paths start from`() {
        val text = CopyPrompt.of(listOf(api()))
        assertTrue(text.contains("- The repository is `E:/work/api`."), text)
    }

    @Test
    fun `names the whole path of the done file`() {
        val text = CopyPrompt.of(listOf(api()))
        assertTrue(text.contains("- Report a finished task in `E:/work/api/.git/y-review/done.txt`."), text)
    }

    @Test
    fun `names the short commit of the folder`() {
        val text = CopyPrompt.of(listOf(api()))
        assertTrue(text.contains("- The tasks belong to the git commit 44787c6."), text)
    }

    @Test
    fun `numbers the only folder as one of one`() {
        assertTrue(CopyPrompt.of(listOf(api())).contains("## Folder 1 of 1: api"))
    }

    // --- Several folders ---

    @Test
    fun `names every folder of a project of two repositories`() {
        val text = CopyPrompt.of(listOf(api(), web()))
        assertTrue(text.contains("## Folder 1 of 2: api"), text)
        assertTrue(text.contains("## Folder 2 of 2: web"), text)
    }

    @Test
    fun `gives each folder the done file of that folder`() {
        val text = CopyPrompt.of(listOf(api(), web()))
        assertTrue(text.contains("`E:/work/api/.git/y-review/done.txt`"), text)
        assertTrue(text.contains("`E:/work/web/.git/y-review/done.txt`"), text)
    }

    @Test
    fun `reads the rules once for two folders`() {
        assertEquals(1, count(CopyPrompt.of(listOf(api(), web())), "## What an identifier looks like"))
    }

    @Test
    fun `counts the tasks of every folder together`() {
        val text = CopyPrompt.of(listOf(api(), web()))
        assertTrue(text.contains("You work through 2 open review tasks in 2 folders."), text)
    }

    @Test
    fun `puts the done file of a folder in front of the tasks of that folder`() {
        val text = CopyPrompt.of(listOf(api(), web()))
        assertTrue(text.indexOf("E:/work/api/.git/y-review/done.txt") < text.indexOf("a1b2c3 comment"), text)
        assertTrue(text.indexOf("a1b2c3 comment") < text.indexOf("E:/work/web/.git/y-review/done.txt"), text)
    }

    // --- The order of the groups ---

    @Test
    fun `keeps the folders in the order the caller gives`() {
        val text = CopyPrompt.of(listOf(web(), api()))
        assertTrue(text.contains("## Folder 1 of 2: web"), text)
        assertTrue(text.contains("## Folder 2 of 2: api"), text)
        assertTrue(text.indexOf("todo-0f1e2d3c-12") < text.indexOf("a1b2c3"), text)
    }

    @Test
    fun `keeps the tasks of one folder together and in order`() {
        val text = CopyPrompt.of(listOf(api(listOf(comment, todo)), web(listOf(comment.copy(id = "ff00aa")))))
        assertTrue(text.indexOf("a1b2c3") < text.indexOf("todo-0f1e2d3c-12"), text)
        assertTrue(text.indexOf("todo-0f1e2d3c-12") < text.indexOf("ff00aa"), text)
    }

    // --- An empty selection ---

    @Test
    fun `says that no task is selected when the list is empty`() {
        assertEquals(CopyPrompt.EMPTY, CopyPrompt.of(emptyList()))
    }

    @Test
    fun `says that no task is selected when every folder is empty`() {
        assertEquals(CopyPrompt.EMPTY, CopyPrompt.of(listOf(api(emptyList()))))
    }

    @Test
    fun `leaves a folder without a task out of the prompt`() {
        val text = CopyPrompt.of(listOf(api(emptyList()), web()))
        assertTrue(text.contains("## Folder 1 of 1: web"), text)
        assertFalse(text.contains("E:/work/api"), text)
    }

    // --- A folder the plugin could not write ---

    @Test
    fun `names no done file when the write failed`() {
        assertFalse(CopyPrompt.of(listOf(api(written = false))).contains("Report a finished task in"))
    }

    @Test
    fun `asks for the answer when the write failed`() {
        val text = CopyPrompt.of(listOf(api(written = false)))
        assertTrue(text.contains("Name every finished identifier in your answer instead."), text)
    }

    @Test
    fun `keeps the tasks of a folder the write failed for`() {
        val text = CopyPrompt.of(listOf(api(written = false)))
        assertTrue(text.contains("a1b2c3 comment src/Parser.kt:88-94"), text)
    }

    @Test
    fun `leaves the other folders whole when one write failed`() {
        val text = CopyPrompt.of(listOf(api(written = false), web()))
        assertTrue(text.contains("- Report a finished task in `E:/work/web/.git/y-review/done.txt`."), text)
        assertEquals(1, count(text, "Name every finished identifier in your answer instead."))
    }

    @Test
    fun `names no commit when the repository is gone`() {
        assertEquals(
            "- The repository is `E:/work/api`.\n" +
                "- Every file path below starts from that folder.\n" +
                "- The plugin writes no file for this folder, and it reads no report file here. " +
                "Name every finished identifier in your answer instead.",
            CopyPrompt.closing(api(written = false).copy(commit = "")),
        )
    }

    // --- The identifiers ---

    @Test
    fun `carries the identifier of every task unchanged`() {
        val text = CopyPrompt.of(listOf(api(listOf(comment)), web(listOf(todo))))
        assertTrue(text.contains("a1b2c3 comment src/Parser.kt:88-94"), text)
        assertTrue(text.contains("todo-0f1e2d3c-12 todo src/Cache.kt:12"), text)
    }

    @Test
    fun `carries the text of every task`() {
        val text = CopyPrompt.of(listOf(api(), web()))
        assertTrue(text.contains("This reload reads git on the user interface thread."), text)
        assertTrue(text.contains("TODO: drop the second lookup."), text)
    }

    // --- The closing instructions of one store ---

    @Test
    fun `answers the closing instructions of a git folder`() {
        assertEquals(
            "- The repository is `E:/work/api`.\n" +
                "- Every file path below starts from that folder.\n" +
                "- The tasks belong to the git commit 44787c6.\n" +
                "- Report a finished task in `E:/work/api/.git/y-review/done.txt`.",
            CopyPrompt.closing(api()),
        )
    }
}
