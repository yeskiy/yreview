package com.yeskiy.yreview.tasks

/** The text of one row of the review tree, and the text one task takes in the clipboard. */
object TaskLabels {

    fun fileTitle(group: TaskGroup): String = group.name

    fun fileCount(group: TaskGroup): String = count(group.tasks.size, "task")

    fun folderTitle(folder: TaskFolder): String = folder.name

    fun folderCount(folder: TaskFolder): String = count(TaskTree.tasksOf(folder).size, "task")

    fun lines(task: ReviewTask): String =
        if (task.endLine <= task.startLine) "${task.startLine}" else "${task.startLine}-${task.endLine}"

    fun taskTitle(task: ReviewTask): String = "${lines(task)}: ${head(task.text)}"

    /** The lines after the first one. A multi-line TODO shows them after the title. */
    fun taskTail(task: ReviewTask): String =
        task.text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.drop(1).joinToString(" ")

    /** The word after the title. A comment shows how it is stored, and a TODO shows its word. */
    fun taskState(task: ReviewTask): String =
        if (task.kind == TaskKind.TODO) task.pattern.orEmpty() else task.state

    /** One task for the clipboard. The identifier stays whole, because an agent copies it back. */
    fun plainText(task: ReviewTask): String =
        "${task.id} ${kindWord(task)} ${task.path}:${lines(task)}\n${task.text.trim()}"

    fun count(value: Int, name: String): String = "$value $name${if (value == 1) "" else "s"}"

    private fun kindWord(task: ReviewTask): String = if (task.kind == TaskKind.TODO) "todo" else "comment"

    private fun head(text: String): String = text.lineSequence().firstOrNull { it.isNotBlank() }.orEmpty().trim()
}
