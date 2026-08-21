package com.yeskiy.yreview.tasks

/** How much of one row the user checked. */
enum class CheckState { NONE, SOME, ALL }

/**
 * The tasks the user checked in the review tree.
 *
 * The set holds identifiers, so a reload of the tree keeps the choice. A node object dies
 * with the reload, and an identifier lives on. A row that holds several tasks reports
 * [CheckState.SOME] when the user checked a part of them.
 */
class TaskChecks {

    private val checked = LinkedHashSet<String>()

    val size: Int get() = checked.size

    fun isChecked(task: ReviewTask): Boolean = keyOf(task) in checked

    fun set(tasks: Collection<ReviewTask>, value: Boolean) {
        val keys = tasks.map { keyOf(it) }
        if (value) checked.addAll(keys) else checked.removeAll(keys.toSet())
    }

    fun clear() {
        checked.clear()
    }

    fun state(tasks: Collection<ReviewTask>): CheckState {
        val hits = tasks.count { isChecked(it) }
        return when (hits) {
            0 -> CheckState.NONE
            tasks.size -> CheckState.ALL
            else -> CheckState.SOME
        }
    }

    fun checkedOf(tasks: Collection<ReviewTask>): List<ReviewTask> = tasks.filter { isChecked(it) }

    companion object {
        /** Two repositories can hold the same relative path, so the key names the file too. */
        fun keyOf(task: ReviewTask): String = "${task.filePath}\n${task.id}"
    }
}
