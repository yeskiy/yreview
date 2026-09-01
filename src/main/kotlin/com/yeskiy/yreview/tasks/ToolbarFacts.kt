package com.yeskiy.yreview.tasks

/**
 * What every button of one toolbar reads while it draws itself.
 *
 * The buttons of the review tab ask the same three questions. Which tasks does the tree
 * hold, which rows did the user highlight, and which rows did the user check. One record
 * answers all three, and the tab builds one record for each expansion of the toolbar. Each
 * button then reads a field of that record.
 *
 * The record holds plain values, so a test runs it without a running IDE.
 */
data class ToolbarFacts(
    val send: SendTarget,
    val write: WriteTarget,
    /** True while the tree holds a task. The check-all button reads it. */
    val anyTask: Boolean,
    /** True while a check box is on. The clear-checks button reads it. */
    val anyCheck: Boolean,
) {

    companion object {

        /**
         * The record of a toolbar that reaches no tree.
         *
         * A button that finds no record disables itself and keeps its plain words. The
         * button acts on the tree of one tab, so a context without that tree offers it
         * nothing to act on.
         */
        val EMPTY = ToolbarFacts(
            SendTarget(SendScope.NONE, emptyList()),
            WriteTarget(WriteScope.NONE, emptyList(), emptyList()),
            anyTask = false,
            anyCheck = false,
        )

        /**
         * Builds the record of one expansion.
         *
         * [checkCount] counts every check box of the tab. A filter hides a row, and the box
         * of that row stays on, so the count can pass the size of [checked].
         */
        fun of(
            all: List<ReviewTask>,
            selected: List<ReviewTask>,
            checked: List<ReviewTask>,
            checkCount: Int,
        ): ToolbarFacts = ToolbarFacts(
            TaskChoice.sendTarget(checked, selected, all),
            TaskChoice.writeTarget(checked, selected),
            anyTask = all.isNotEmpty(),
            anyCheck = checkCount > 0,
        )
    }
}
