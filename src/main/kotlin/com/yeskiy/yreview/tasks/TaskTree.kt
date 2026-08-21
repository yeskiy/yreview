package com.yeskiy.yreview.tasks

/** The tasks of one file, in line order. */
data class TaskGroup(val path: String, val tasks: List<ReviewTask>)

/**
 * Groups the tasks by file, the way the built-in TODO view groups its items.
 *
 * The label of a group comes from the caller. A project with one repository shows the
 * path inside that repository. A project with several repositories shows the repository
 * name in front of the path.
 */
object TaskTree {

    fun group(tasks: List<ReviewTask>, label: (ReviewTask) -> String = { it.path }): List<TaskGroup> =
        tasks.distinctBy { "${it.filePath} ${it.id}" }
            .groupBy(label)
            .toSortedMap()
            .map { (path, found) -> TaskGroup(path, found.sortedWith(ORDER)) }

    fun flatten(groups: List<TaskGroup>): List<ReviewTask> = groups.flatMap { it.tasks }

    private val ORDER = compareBy<ReviewTask>({ it.startLine }, { it.endLine }, { it.id })
}
