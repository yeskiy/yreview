package com.yeskiy.yreview.tasks

import com.intellij.openapi.util.text.HtmlBuilder
import com.intellij.openapi.util.text.HtmlChunk
import com.yeskiy.yreview.store.RangeText

/** The text of one row of the review tree, and the text one task takes in the clipboard. */
object TaskLabels {

    /**
     * How many characters of the text one row of the tree shows.
     *
     * A review comment can hold a paragraph, and a tree row that holds a paragraph pushes
     * every other row out of sight. The full text stays in the clipboard, in tasks.json, in
     * the preview pane and in the tooltip of the row.
     */
    const val ROW_LIMIT = 100

    /** The mark at the end of a row whose text goes on. */
    const val MORE = "..."

    /** How many characters of the text the tooltip of a row shows. */
    const val TOOLTIP_LIMIT = 2_000

    /** How many lines of the text the tooltip of a row shows. */
    const val TOOLTIP_LINES = 20

    fun fileTitle(group: TaskGroup): String = group.name

    fun fileCount(group: TaskGroup): String = count(group.tasks.size, "task")

    fun folderTitle(folder: TaskFolder): String = folder.name

    fun folderCount(folder: TaskFolder): String = count(TaskTree.tasksOf(folder).size, "task")

    fun lines(task: ReviewTask): String = when {
        RangeText.hasColumns(task.startColumn, task.endColumn) ->
            RangeText.compact(task.startLine, task.startColumn, task.endLine, task.endColumn)
        task.endLine <= task.startLine -> "${task.startLine}"
        else -> "${task.startLine}-${task.endLine}"
    }

    fun taskTitle(task: ReviewTask): String = "${lines(task)}: ${rowText(task.text)}"

    /**
     * The text of one row.
     *
     * A row holds one line, because a line break in a tree row reads worse than a long row.
     * A text of several lines therefore keeps the first line alone. A line longer than
     * [ROW_LIMIT] ends after that many characters, and [MORE] says that the text goes on.
     */
    fun rowText(text: String): String {
        val lines = textLines(text)
        val first = lines.firstOrNull().orEmpty()
        val short = TaskText.cut(first, ROW_LIMIT).trimEnd()
        return if (short.length < first.length || lines.size > 1) "$short$MORE" else short
    }

    /** The first line of a text that holds something. An empty text gives an empty line. */
    fun firstLine(text: String): String = textLines(text).firstOrNull().orEmpty()

    /** The word after the title. A comment shows how it is stored, and a TODO shows its word. */
    fun taskState(task: ReviewTask): String =
        if (task.kind == TaskKind.TODO) task.pattern.orEmpty() else task.state

    /**
     * The tooltip of one row. It names the place and then holds the text.
     *
     * The row is short, so the tooltip carries the text the row cannot show. The builder
     * escapes every character that means something in HTML.
     */
    fun taskTooltip(task: ReviewTask): String =
        HtmlBuilder()
            .append(HtmlChunk.text("${task.path}:${lines(task)}").bold())
            .br()
            .appendWithSeparators(HtmlChunk.br(), tooltipLines(task.text.trim()).map { HtmlChunk.text(it) })
            .wrapWithHtmlBody()
            .toString()

    /**
     * One task for the clipboard. The identifier stays whole, because an agent copies it back.
     *
     * A person pastes this text into a terminal, so the text and the path of the task both
     * follow the rule of [TaskText] first. The path comes from the same record as the text,
     * and it holds no line, so it keeps no control character at all.
     */
    fun plainText(task: ReviewTask): String =
        "${task.id} ${kindWord(task)} ${TaskText.path(task.path)}:${lines(task)}\n" +
            TaskText.of(task.text).trim()

    fun count(value: Int, name: String): String = "$value $name${if (value == 1) "" else "s"}"

    private fun kindWord(task: ReviewTask): String = if (task.kind == TaskKind.TODO) "todo" else "comment"

    /**
     * The lines of one tooltip.
     *
     * A review comment can hold a million characters, and the layout of Swing reads every
     * one of them. The tooltip therefore ends after [TOOLTIP_LIMIT] characters and after
     * [TOOLTIP_LINES] lines, and [MORE] says that the text goes on. Both bounds stay far
     * above [ROW_LIMIT], so the tooltip still shows what the row cannot.
     */
    private fun tooltipLines(text: String): List<String> {
        val rows = TaskText.cut(text, TOOLTIP_LIMIT).lines()
        val kept = rows.take(TOOLTIP_LINES)
        return if (kept.size < rows.size || text.length > TOOLTIP_LIMIT) kept + MORE else kept
    }

    private fun textLines(text: String): List<String> =
        text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
}
