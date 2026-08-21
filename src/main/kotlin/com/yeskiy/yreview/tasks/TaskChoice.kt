package com.yeskiy.yreview.tasks

/** Where the tasks of one send come from. */
enum class SendScope { CHECKED, SELECTED, ALL, NONE }

/** Where the rows of one write come from. A write never reads the whole tree. */
enum class WriteScope { CHECKED, SELECTED, NONE }

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
 * The rows that a resolve or a delete acts on, split by kind.
 *
 * A resolve writes to the git notes, so a resolve acts on review comments only. A TODO
 * lives in the source file and not in a note, and [todos] holds those rows.
 *
 * A delete acts on both kinds. It removes a review comment from the git notes, and it
 * removes a TODO from the source file.
 */
data class WriteTarget(
    val scope: WriteScope,
    val comments: List<ReviewTask>,
    val todos: List<ReviewTask>,
) {

    /** True while the target holds no row at all. A delete needs one row of either kind. */
    val empty: Boolean get() = comments.isEmpty() && todos.isEmpty()

    /** True while the target holds a review comment. A resolve needs one. */
    val hasComments: Boolean get() = comments.isNotEmpty()

    /** The question the delete dialog asks. It names both counts and starts with the risk. */
    val deleteQuestion: String get() = listOfNotNull(commentRisk, todoRisk).joinToString(" ")

    /** What the notice says about the rows a resolve leaves alone. It is empty when there are none. */
    val todoNotice: String
        get() = if (todos.isEmpty()) {
            ""
        } else {
            "A TODO lives in the source file and not in a note. " +
                "The plugin kept ${TaskLabels.count(todos.size, "TODO row")}."
        }

    private val commentRisk: String?
        get() = if (comments.isEmpty()) {
            null
        } else {
            "You cannot put a review comment back. " +
                "The plugin removes ${TaskLabels.count(comments.size, "review comment")} from the git notes."
        }

    private val todoRisk: String?
        get() = if (todos.isEmpty()) {
            null
        } else {
            "The plugin removes ${TaskLabels.count(todos.size, "TODO item")} from the source. " +
                "One undo step puts the text back."
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

    /** The rows of a resolve or a delete. The whole tree is never one of the answers. */
    fun writeTarget(checked: List<ReviewTask>, selected: List<ReviewTask>): WriteTarget = when {
        checked.isNotEmpty() -> target(WriteScope.CHECKED, checked)
        selected.isNotEmpty() -> target(WriteScope.SELECTED, selected)
        else -> WriteTarget(WriteScope.NONE, emptyList(), emptyList())
    }

    /**
     * The task the preview pane shows.
     *
     * A folder row and the root row carry every task under them, so the first one of the
     * selection fills the pane. A tree with no selection shows its first task.
     */
    fun previewTask(selected: List<ReviewTask>, all: List<ReviewTask>): ReviewTask? =
        selected.firstOrNull() ?: all.firstOrNull()

    /** The row the next occurrence action moves to. The value is -1 when there is none. */
    fun nextIndex(size: Int, current: Int): Int = if (current + 1 < size) current + 1 else -1

    /** The row the previous occurrence action moves to. A tree with no selection ends last. */
    fun previousIndex(size: Int, current: Int): Int = when {
        current < 0 -> size - 1
        current > 0 -> current - 1
        else -> -1
    }

    private fun target(scope: WriteScope, rows: List<ReviewTask>): WriteTarget =
        WriteTarget(
            scope,
            rows.filter { it.kind == TaskKind.COMMENT }.distinctBy { it.id },
            rows.filter { it.kind == TaskKind.TODO },
        )
}
