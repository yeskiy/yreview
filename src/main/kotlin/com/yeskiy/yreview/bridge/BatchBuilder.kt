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
 * The channel drops a batch that breaks one rule of its schema, and it drops it in
 * silence. The builder therefore checks every value here and leaves out a task it cannot
 * carry, rather than losing the whole batch for one bad row. Every task the builder
 * leaves out arrives in [BatchPlan.dropped], so the caller reports the loss.
 */
class BatchBuilder(private val newBatchId: () -> String = { randomBatchId() }) {

    fun build(branch: String, commit: String, tasks: List<ReviewTask>): BatchPlan {
        if (!isRevision(commit)) {
            return BatchPlan(emptyList(), tasks.map { DroppedTask(it.id, COMMIT_REASON) })
        }
        val checked = tasks.map { it to problemOf(it) }
        return BatchPlan(
            checked.filter { it.second == null }
                .map { commentOf(it.first) }
                .chunked(MAX_COMMENTS)
                .map { ReviewBatch(newBatchId(), branchName(branch), commit, it) },
            checked.mapNotNull { (task, problem) -> problem?.let { DroppedTask(task.id, it) } },
        )
    }

    private fun problemOf(task: ReviewTask): String? = when {
        !ID.matches(task.id) -> ID_REASON
        !isRevision(task.revision) -> REVISION_REASON
        task.path.isEmpty() || task.path.length > MAX_PATH || task.path.any { isControl(it) } -> PATH_REASON
        task.text.isBlank() -> TEXT_REASON
        else -> null
    }

    private fun commentOf(task: ReviewTask): BatchComment = BatchComment(
        id = task.id,
        path = task.path,
        startLine = task.startLine.coerceIn(0, MAX_LINE),
        endLine = task.endLine.coerceIn(0, MAX_LINE),
        revision = task.revision,
        text = TaskText.of(task.text).trim().take(MAX_TEXT),
    )

    private fun branchName(branch: String): String =
        branch.filterNot { isControl(it) }.take(MAX_BRANCH).ifEmpty { "HEAD" }

    companion object {
        const val MAX_COMMENTS = 200
        const val MAX_TEXT = 20_000
        const val MAX_PATH = 1024
        const val MAX_BRANCH = 255
        const val MAX_LINE = 10_000_000

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

        /** The characters the channel refuses in a path and in a branch name. */
        private fun isControl(value: Char): Boolean = value.code < 0x20 || value.code == 0x7f

        private fun randomBatchId(): String {
            val bytes = ByteArray(BATCH_ID_BYTES)
            random.nextBytes(bytes)
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
