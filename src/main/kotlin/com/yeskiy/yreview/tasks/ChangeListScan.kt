package com.yeskiy.yreview.tasks

import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.changes.ChangeListManager

/**
 * What the review window found in the local changes of one project.
 *
 * [files] holds the full path of every file that the changelist names and that still
 * stands in the working tree. The tab keeps a task when the file of the task is in that
 * set. A project that keeps no changelist reports one list that holds every local change,
 * and [listsEnabled] is false there.
 */
data class ChangeListFacts(
    val vcsFound: Boolean = false,
    val listsEnabled: Boolean = true,
    val listName: String = "",
    val files: Set<String> = emptySet(),
)

/**
 * The rules of the changelist tab.
 *
 * The bundled TODO window holds the same tab. Its tree keeps a file when the default
 * changelist names that file, and then it shows every TODO item of the file. It does not
 * compare the file with the committed version, so it does not show the new items alone.
 * This tab follows the same rule, and the tooltip of the tab says so.
 */
object ChangeListTab {

    /**
     * The files that the tab reads.
     *
     * A change that deletes a file names no file in the working tree, so that change drops
     * out. Two changes of one file give one path.
     */
    fun files(current: List<String?>): Set<String> = current.filterNotNull().filter { it.isNotEmpty() }.toSet()

    /** The tasks whose file is in the changelist. Every other task drops out. */
    fun keep(tasks: List<ReviewTask>, files: Set<String>): List<ReviewTask> = tasks.filter { it.filePath in files }

    /**
     * The name of the tab.
     *
     * The bundled tab reads the default changelist, and it puts the name of that list on
     * the tab. A project that keeps no changelist shows the local changes instead.
     */
    fun tabTitle(facts: ChangeListFacts): String {
        if (!facts.listsEnabled) return ALL_CHANGES
        val name = facts.listName.trim()
        return when {
            name.isEmpty() -> TaskScope.CHANGE_LIST.title
            name.endsWith(SUFFIX, ignoreCase = true) -> name
            else -> "$name $SUFFIX"
        }
    }

    /** The tooltip of the tab. It says that the tab shows every task of the changed files. */
    fun tabTooltip(facts: ChangeListFacts): String = "Every open review task of the files of ${where(facts)}."

    /** The words the empty tree shows, so a blank tab explains itself. */
    fun emptyText(facts: ChangeListFacts): String = when {
        !facts.vcsFound -> NO_VCS
        facts.files.isEmpty() -> "No file is in ${where(facts)}."
        else -> "No open review task is in ${where(facts)}."
    }

    private fun where(facts: ChangeListFacts): String =
        if (facts.listsEnabled && facts.listName.isNotBlank()) {
            "the changelist \"${facts.listName.trim()}\""
        } else {
            "the local changes"
        }

    private const val ALL_CHANGES = "Local Changes"

    private const val SUFFIX = "Changelist"

    private const val NO_VCS =
        "This project has no version control system. Add one under Settings, Version Control."
}

/**
 * Reads the default changelist of a project.
 *
 * Every call here reads the version control state, so the caller runs it off the user
 * interface thread. `Change.getVirtualFile` gives the file of the revision after the
 * change, and it gives null for a deleted file.
 */
object ChangeListScan {

    fun read(project: Project): ChangeListFacts {
        val manager = ChangeListManager.getInstance(project)
        val list = manager.defaultChangeList
        return ChangeListFacts(
            vcsFound = ProjectLevelVcsManager.getInstance(project).hasActiveVcss(),
            listsEnabled = manager.areChangeListsEnabled(),
            listName = list.name,
            files = ChangeListTab.files(list.changes.map { it.virtualFile?.path }),
        )
    }
}
