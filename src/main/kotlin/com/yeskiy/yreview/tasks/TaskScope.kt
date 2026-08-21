package com.yeskiy.yreview.tasks

/**
 * The tabs of the review tool window, one tab per scope.
 *
 * The built-in TODO window puts the same choice on a tab strip above the tree. Each tab
 * keeps its own view state, so a group toggle of one tab leaves the other tabs alone.
 */
enum class TaskScope(val title: String, val summary: String) {

    PROJECT("Project", "Every open review task of this project."),

    CURRENT_FILE("Current File", "The open review tasks of the file in the editor."),

    SCOPE_BASED("Scope Based", "The open review tasks of the chosen scope."),

    /**
     * The tab of the default changelist.
     *
     * The title here is the title the tab shows before the first read of the local
     * changes. After that read the tab carries the name of the changelist, as the bundled
     * TODO window does. See [ChangeListTab.tabTitle].
     */
    CHANGE_LIST("Changelist", "The open review tasks of the files of the default changelist."),
}
