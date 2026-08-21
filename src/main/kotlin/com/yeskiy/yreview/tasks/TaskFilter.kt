package com.yeskiy.yreview.tasks

/**
 * Which kind of row the tree keeps.
 *
 * This choice is free of the TODO filter. A user who asks for review comments only keeps
 * that view whatever TODO filter the same menu holds.
 */
enum class TaskKindFilter(val label: String, val summary: String) {

    BOTH("Comments and TODO Items", "Show the review comments and the TODO items together."),

    COMMENTS("Review Comments Only", "Hide every TODO item and keep the review comments."),

    TODOS("TODO Items Only", "Hide every review comment and keep the TODO items."),
}

/**
 * The two filters of the toolbar.
 *
 * The kind filter picks the rows by kind. The TODO filters come from Settings, Editor,
 * TODO, and the user owns them. One TODO filter holds a set of TODO patterns, and the rule
 * text names each pattern. A TODO row stays when its rule is in that set. A review comment
 * is not a TODO, so no TODO filter removes it.
 *
 * A null rule set means that the user chose no TODO filter, so every row stays.
 */
object TaskFilter {

    fun acceptsKind(task: ReviewTask, kind: TaskKindFilter): Boolean = when (kind) {
        TaskKindFilter.BOTH -> true
        TaskKindFilter.COMMENTS -> task.kind == TaskKind.COMMENT
        TaskKindFilter.TODOS -> task.kind == TaskKind.TODO
    }

    fun acceptsRules(task: ReviewTask, rules: Set<String>?): Boolean =
        rules == null || task.kind != TaskKind.TODO || task.patternRule in rules

    fun accepts(
        task: ReviewTask,
        rules: Set<String>?,
        kind: TaskKindFilter = TaskKindFilter.BOTH,
    ): Boolean = acceptsKind(task, kind) && acceptsRules(task, rules)

    fun apply(
        tasks: List<ReviewTask>,
        rules: Set<String>?,
        kind: TaskKindFilter = TaskKindFilter.BOTH,
    ): List<ReviewTask> =
        if (rules == null && kind == TaskKindFilter.BOTH) tasks else tasks.filter { accepts(it, rules, kind) }
}
