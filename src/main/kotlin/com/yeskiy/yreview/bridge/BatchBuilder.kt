package com.yeskiy.yreview.bridge

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskText
import java.security.SecureRandom

/** One task the channel cannot carry, and the reason it cannot carry it. */
data class DroppedTask(val id: String, val reason: String)

/** The batches the builder made, and the tasks it left out. */
data class BatchPlan(val batches: List<ReviewBatch>, val dropped: List<DroppedTask> = emptyList()) {

    val tasks: Int get() = batches.sumOf { it.comments.size }

    /** Every reason, once, in one phrase for the notice. */
    val reason: String get() = dropped.map { it.reason }.distinct().joinToString(" and ")
}

/**
 * Turns the tasks of one repository into the batches the channel accepts.
 *
 * The channel drops a whole batch that breaks one rule of its schema or passes the size of
 * one event. The builder therefore checks every value here and leaves out a task it cannot
 * carry, rather than losing the whole batch for one bad row. Every task the builder
 * leaves out arrives in [BatchPlan.dropped], so the caller reports the loss.
 */
class BatchBuilder(private val newBatchId: () -> String = { randomBatchId() }) {

    fun build(branch: String, commit: String, tasks: List<ReviewTask>): BatchPlan {
        if (!isRevision(commit)) {
            return BatchPlan(emptyList(), tasks.map { DroppedTask(it.id, COMMIT_REASON) })
        }
        val rows = tasks.map { task -> rowOf(task) }
        val name = branchName(branch)
        return BatchPlan(
            groups(name, commit, rows.mapNotNull { it.comment }).map { ReviewBatch(newBatchId(), name, commit, it) },
            rows.mapNotNull { row -> row.problem?.let { DroppedTask(row.id, it) } },
        )
    }

    /** The text is checked after the filter, because that is the text the channel reads. */
    private fun rowOf(task: ReviewTask): Row = problemOf(task)?.let { Row(task.id, null, it) }
        ?: commentOf(task).let { if (it.text.isEmpty()) Row(task.id, null, TEXT_REASON) else Row(task.id, it, null) }

    private data class Row(val id: String, val comment: BatchComment?, val problem: String?)

    private fun problemOf(task: ReviewTask): String? = when {
        !ID.matches(task.id) -> ID_REASON
        !isRevision(task.revision) -> REVISION_REASON
        task.path.isEmpty() || task.path.length > MAX_PATH || task.path.any { TaskText.isAnyControl(it) } -> PATH_REASON
        else -> null
    }

    /** The comments in groups that each fit one batch and one channel event of [MAX_EVENT_CHARS], frame included. */
    private fun groups(branch: String, commit: String, comments: List<BatchComment>): List<List<BatchComment>> {
        val frame = BatchJson.encode(ReviewBatch(SIZE_ID, branch, commit, emptyList())).length + EVENT_FRAME
        return comments.fold(mutableListOf<Group>()) { groups, comment ->
            val size = BatchJson.encode(comment).length + 1
            val last = groups.lastOrNull()
            if (last != null && last.comments.size < MAX_COMMENTS && frame + last.size + size <= MAX_EVENT_CHARS) {
                groups[groups.lastIndex] = Group(last.comments + comment, last.size + size)
            } else {
                groups += Group(listOf(comment), size)
            }
            groups
        }.map { it.comments }
    }

    private data class Group(val comments: List<BatchComment>, val size: Int)

    private fun commentOf(task: ReviewTask): BatchComment = BatchComment(
        id = task.id,
        path = task.path,
        startLine = task.startLine.coerceIn(0, MAX_LINE),
        startColumn = task.startColumn?.coerceIn(0, MAX_LINE),
        endLine = task.endLine.coerceIn(0, MAX_LINE),
        endColumn = task.endColumn?.coerceIn(0, MAX_LINE),
        revision = task.revision,
        text = TaskText.cut(TaskText.of(task.text).trim(), MAX_TEXT),
    )

    private fun branchName(branch: String): String =
        TaskText.cut(branch.filterNot { TaskText.isAnyControl(it) }, MAX_BRANCH).ifEmpty { "HEAD" }

    companion object {
        const val MAX_COMMENTS = 200
        const val MAX_TEXT = 20_000
        const val MAX_PATH = 1024
        const val MAX_BRANCH = 255
        const val MAX_LINE = 10_000_000

        // The same limit stands in channel-server BridgeClient.kt. Keep the two copies equal.
        const val MAX_EVENT_CHARS = 4_000_000

        /** The characters of "data: " and of the blank line that ends one event. */
        private const val EVENT_FRAME = 8

        /** A batch id of the longest length the channel accepts, so a size count never falls short. */
        private val SIZE_ID = "x".repeat(200)

        const val ID_REASON = "the identifier breaks the channel rule"
        const val REVISION_REASON = "the revision is not a git revision"
        const val PATH_REASON = "the path breaks the channel rule"
        const val TEXT_REASON = "the task has no text"
        const val COMMIT_REASON = "the commit of the repository is not a git revision"

        private const val BATCH_ID_BYTES = 6

        // The same rule stands in channel-server Schema.kt. Keep the two copies equal.
        private val ID = Regex("^[A-Za-z0-9_-]{1,200}$")
        private val REVISION = Regex("^[A-Za-z0-9._/-]{1,200}$")

        private val random = SecureRandom()

        fun isRevision(text: String): Boolean = REVISION.matches(text)

        private fun randomBatchId(): String {
            val bytes = ByteArray(BATCH_ID_BYTES)
            random.nextBytes(bytes)
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
