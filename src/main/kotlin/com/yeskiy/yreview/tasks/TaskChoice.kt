package com.yeskiy.yreview.tasks

/** Where the tasks of one send come from. */
enum class SendScope { CHECKED, SELECTED, ALL, NONE }

/** The tasks one send carries, and the words the button shows before the user clicks it. */
data class SendTarget(val scope: SendScope, val tasks: List<ReviewTask>) {

    val text: String
        get() = when (scope) {
            SendScope.CHECKED -> "Send Checked (${tasks.size})"
            SendScope.SELECTED -> "Send Selected (${tasks.size})"
            SendScope.ALL -> "Send All (${tasks.size})"
            SendScope.NONE -> "Send to the Agent"
        }

    val description: String
        get() = when (scope) {
            SendScope.CHECKED -> "Send the ${TaskLabels.count(tasks.size, "checked task")} to the agent."
            SendScope.SELECTED -> "Send the ${TaskLabels.count(tasks.size, "selected row")} to the agent."
            SendScope.ALL ->
                "No row is checked, so the whole tree goes out. It holds ${TaskLabels.count(tasks.size, "task")}."
            SendScope.NONE -> "This project has no open review task."
        }
}

/**
 * What the toolbar acts on.
 *
 * A check box beats a highlighted row, and a highlighted row beats the whole tree. The
 * button names the choice, so no send takes the user by surprise.
 */
object TaskChoice {

    fun sendTarget(
        checked: List<ReviewTask>,
        selected: List<ReviewTask>,
        all: List<ReviewTask>,
    ): SendTarget = when {
        checked.isNotEmpty() -> SendTarget(SendScope.CHECKED, checked)
        selected.isNotEmpty() -> SendTarget(SendScope.SELECTED, selected)
        all.isNotEmpty() -> SendTarget(SendScope.ALL, all)
        else -> SendTarget(SendScope.NONE, emptyList())
    }

    /** The row the next occurrence action moves to. The value is -1 when there is none. */
    fun nextIndex(size: Int, current: Int): Int = if (current + 1 < size) current + 1 else -1

    /** The row the previous occurrence action moves to. A tree with no selection ends last. */
    fun previousIndex(size: Int, current: Int): Int = when {
        current < 0 -> size - 1
        current > 0 -> current - 1
        else -> -1
    }
}
