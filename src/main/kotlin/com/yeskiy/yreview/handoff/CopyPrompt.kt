package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskLabels

/**
 * Where the review files of one folder live.
 *
 * A git repository keeps them inside the git directory. A folder that no git repository
 * covers needs a store of its own, and that store closes a task through another path.
 */
enum class StoreKind { GIT }

/**
 * One group of the clipboard prompt.
 *
 * The tasks of one group belong to one folder. [root] is the folder every [ReviewTask.path]
 * starts from, and [done] is the whole path of the file an agent appends an identifier to.
 * [written] is false when the plugin could not write the files of the group, and then the
 * plugin reads no done file there.
 */
data class PromptFolder(
    val store: StoreKind,
    val name: String,
    val root: String,
    val done: String,
    val commit: String,
    val tasks: List<ReviewTask>,
    val written: Boolean,
)

/**
 * The text the copy action puts in the clipboard.
 *
 * An agent that reads this text knows nothing about the plugin, so the rules of
 * [AgentGuide] come first and whole. One section for each folder follows. A section names
 * the folder, it names the path that closes a task of that folder, and it lists the tasks.
 *
 * A project of several repositories therefore reaches one agent in one prompt, and the
 * agent never has to guess which done file belongs to which task.
 */
object CopyPrompt {

    const val EMPTY = "No open review task is selected."

    private const val SHORT_COMMIT = 7

    fun of(folders: List<PromptFolder>): String {
        val groups = folders.filter { it.tasks.isNotEmpty() }
        if (groups.isEmpty()) return EMPTY
        return listOf(head(groups), AgentGuide.RULES)
            .plus(groups.mapIndexed { index, group -> section(index, groups.size, group) })
            .joinToString("\n\n")
    }

    /**
     * The closing instructions of one folder.
     *
     * Every kind of store answers here, and nowhere else. A second kind of store adds one
     * branch to this function, and the rest of the builder stays as it is.
     */
    fun closing(folder: PromptFolder): String = when (folder.store) {
        StoreKind.GIT -> listOfNotNull(
            "- The repository is `${folder.root}`.",
            "- Every file path below starts from that folder.",
            commitLine(folder),
            reportLine(folder),
        ).joinToString("\n")
    }

    private fun head(groups: List<PromptFolder>): String =
        "${AgentGuide.TITLE}\n\n" +
            "You work through ${TaskLabels.count(groups.sumOf { it.tasks.size }, "open review task")} " +
            "in ${TaskLabels.count(groups.size, "folder")}. Read the rules once. " +
            "Each folder below names its own repository and its own report file."

    private fun section(index: Int, size: Int, folder: PromptFolder): String =
        "## Folder ${index + 1} of $size: ${folder.name}\n\n" +
            "${closing(folder)}\n\n" +
            folder.tasks.joinToString("\n\n") { TaskLabels.plainText(it) }

    private fun commitLine(folder: PromptFolder): String? =
        if (folder.commit.isEmpty()) {
            null
        } else {
            "- The tasks belong to the git commit ${folder.commit.take(SHORT_COMMIT)}."
        }

    private fun reportLine(folder: PromptFolder): String =
        if (folder.written) {
            "- Report a finished task in `${folder.done}`."
        } else {
            "- The plugin writes no file for this folder, and it reads no report file here. " +
                "Name every finished identifier in your answer instead."
        }
}
