package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskLabels

/**
 * The text the plugin copies to the clipboard when the channel is out of reach.
 *
 * The first two lines name the files and the count. The task list follows, because an
 * agent that cannot open a file still needs the work. That is the only repetition.
 */
object HandoffPrompt {

    private const val SHORT_COMMIT = 7

    fun of(folder: String, commit: String, tasks: List<ReviewTask>): String {
        val head = "Read $folder/${AgentGuide.FILE_NAME}, then work through $folder/${HandoffFiles.TASKS_NAME}."
        val files = tasks.map { it.path }.distinct().size
        val counts = "${TaskLabels.count(tasks.size, "open task")} in ${TaskLabels.count(files, "file")}"
        return "$head\n$counts at commit ${commit.take(SHORT_COMMIT)}.\n\n" +
            tasks.joinToString("\n\n") { TaskLabels.plainText(it) }
    }
}
