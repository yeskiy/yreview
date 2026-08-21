package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The rules of the changelist tab, without a display.
 *
 * The panel turns each change of the default changelist into the path of the file after
 * the change. `Change.getVirtualFile` gives null for a deleted file, so a deletion arrives
 * here as a null path.
 */
class ChangeListTabTest {

    private fun task(id: String, path: String, filePath: String): ReviewTask = ReviewTask(
        id = id,
        kind = TaskKind.TODO,
        path = path,
        startLine = 1,
        endLine = 1,
        text = "TODO write the test",
        filePath = filePath,
    )

    // --- The files the tab selects ---

    @Test
    fun `takes the file of every change`() {
        assertEquals(
            setOf("C:/work/a.kt", "C:/work/b.kt"),
            ChangeListTab.files(listOf("C:/work/a.kt", "C:/work/b.kt")),
        )
    }

    @Test
    fun `drops a change that deletes its file`() {
        assertEquals(setOf("C:/work/a.kt"), ChangeListTab.files(listOf("C:/work/a.kt", null)))
    }

    @Test
    fun `drops a change that names an empty path`() {
        assertEquals(setOf("C:/work/a.kt"), ChangeListTab.files(listOf("C:/work/a.kt", "")))
    }

    @Test
    fun `gives one path for two changes of one file`() {
        assertEquals(setOf("C:/work/a.kt"), ChangeListTab.files(listOf("C:/work/a.kt", "C:/work/a.kt")))
    }

    @Test
    fun `gives no file for a changelist that holds no change`() {
        assertTrue(ChangeListTab.files(emptyList()).isEmpty())
    }

    // --- The tasks the tab keeps ---

    @Test
    fun `keeps the tasks of the changed files only`() {
        val inside = task("1", "a.kt", "C:/work/a.kt")
        val outside = task("2", "b.kt", "C:/work/b.kt")

        assertEquals(listOf(inside), ChangeListTab.keep(listOf(inside, outside), setOf("C:/work/a.kt")))
    }

    @Test
    fun `keeps every task of one changed file`() {
        val first = task("1", "a.kt", "C:/work/a.kt")
        val second = task("2", "a.kt", "C:/work/a.kt")

        assertEquals(listOf(first, second), ChangeListTab.keep(listOf(first, second), setOf("C:/work/a.kt")))
    }

    @Test
    fun `keeps no task when the changelist holds no file`() {
        assertTrue(ChangeListTab.keep(listOf(task("1", "a.kt", "C:/work/a.kt")), emptySet()).isEmpty())
    }

    // --- The name of the tab ---

    @Test
    fun `names the tab after the default changelist`() {
        assertEquals("Changes Changelist", ChangeListTab.tabTitle(facts(listName = "Changes")))
    }

    @Test
    fun `writes the word Changelist once`() {
        assertEquals("Work Changelist", ChangeListTab.tabTitle(facts(listName = "Work Changelist")))
        assertEquals("Work changelist", ChangeListTab.tabTitle(facts(listName = "Work changelist")))
    }

    @Test
    fun `cuts the blanks around the name of the list`() {
        assertEquals("Changes Changelist", ChangeListTab.tabTitle(facts(listName = "  Changes  ")))
    }

    @Test
    fun `names the local changes when the project keeps no changelist`() {
        assertEquals("Local Changes", ChangeListTab.tabTitle(facts(listsEnabled = false, listName = "Changes")))
    }

    @Test
    fun `falls back to the title of the scope when the list has no name`() {
        assertEquals(TaskScope.CHANGE_LIST.title, ChangeListTab.tabTitle(facts(listName = "")))
    }

    // --- The tooltip ---

    @Test
    fun `the tooltip says that the tab shows every task of the changed files`() {
        assertEquals(
            "Every open review task of the files of the changelist \"Changes\".",
            ChangeListTab.tabTooltip(facts(listName = "Changes")),
        )
        assertEquals(
            "Every open review task of the files of the local changes.",
            ChangeListTab.tabTooltip(facts(listsEnabled = false)),
        )
    }

    // --- The empty tree ---

    @Test
    fun `a project without version control says so`() {
        assertEquals(
            "This project has no version control system. Add one under Settings, Version Control.",
            ChangeListTab.emptyText(facts(vcsFound = false, listName = "Changes")),
        )
    }

    @Test
    fun `an empty changelist names the list`() {
        assertEquals(
            "No file is in the changelist \"Changes\".",
            ChangeListTab.emptyText(facts(vcsFound = true, listName = "Changes")),
        )
    }

    @Test
    fun `an empty changelist of a project without changelists names the local changes`() {
        assertEquals(
            "No file is in the local changes.",
            ChangeListTab.emptyText(facts(vcsFound = true, listsEnabled = false, listName = "Changes")),
        )
    }

    @Test
    fun `a changelist without a task says that it holds no task`() {
        assertEquals(
            "No open review task is in the changelist \"Changes\".",
            ChangeListTab.emptyText(
                facts(vcsFound = true, listName = "Changes", files = setOf("C:/work/a.kt")),
            ),
        )
    }

    private fun facts(
        vcsFound: Boolean = true,
        listsEnabled: Boolean = true,
        listName: String = "Changes",
        files: Set<String> = emptySet(),
    ): ChangeListFacts = ChangeListFacts(vcsFound, listsEnabled, listName, files)
}
