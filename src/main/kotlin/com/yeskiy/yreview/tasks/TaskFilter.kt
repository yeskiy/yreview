package com.yeskiy.yreview.tasks

/**
 * The TODO filter of the toolbar.
 *
 * The filters come from Settings, Editor, TODO, and the user owns them. One filter holds a
 * set of TODO patterns, and the rule text names each pattern. A TODO row stays when its
 * rule is in that set. A review comment is not a TODO, so no filter removes it.
 *
 * A null set means that the user chose no filter, so every row stays.
 */
object TaskFilter {

    fun accepts(task: ReviewTask, rules: Set<String>?): Boolean =
        rules == null || task.kind != TaskKind.TODO || task.patternRule in rules

    fun apply(tasks: List<ReviewTask>, rules: Set<String>?): List<ReviewTask> =
        if (rules == null) tasks else tasks.filter { accepts(it, rules) }
}
