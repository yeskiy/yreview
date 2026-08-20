package com.yeskiy.ideareview.bridge

import com.yeskiy.ideareview.store.StoredComment
import java.security.SecureRandom

/**
 * Turns the comments of one repository into the batches the channel accepts.
 *
 * The channel drops a batch that breaks one rule of its schema, and it drops it in
 * silence. The builder therefore checks every value here and leaves out a comment it
 * cannot carry, rather than losing the whole batch for one bad row.
 */
class BatchBuilder(private val newBatchId: () -> String = { randomBatchId() }) {

    fun build(branch: String, commit: String, comments: List<StoredComment>): List<ReviewBatch> {
        if (!isRevision(commit)) return emptyList()
        return comments.mapNotNull { commentOf(it) }
            .chunked(MAX_COMMENTS)
            .map { ReviewBatch(newBatchId(), branchName(branch), commit, it) }
    }

    private fun commentOf(stored: StoredComment): BatchComment? {
        val location = stored.comment.location ?: return null
        if (!ID.matches(stored.id)) return null
        if (!isRevision(location.commit)) return null

        val path = location.path
        if (path.isEmpty() || path.length > MAX_PATH || path.any { isControl(it) }) return null

        val text = stored.comment.description.orEmpty().trim()
        if (text.isEmpty()) return null

        return BatchComment(
            id = stored.id,
            path = path,
            startLine = (location.range?.startLine ?: 0).coerceIn(0, MAX_LINE),
            endLine = (location.range?.endLine ?: 0).coerceIn(0, MAX_LINE),
            revision = location.commit,
            text = text.take(MAX_TEXT),
        )
    }

    private fun branchName(branch: String): String =
        branch.filterNot { isControl(it) }.take(MAX_BRANCH).ifEmpty { "HEAD" }

    companion object {
        const val MAX_COMMENTS = 200
        const val MAX_TEXT = 20_000
        const val MAX_PATH = 1024
        const val MAX_BRANCH = 255
        const val MAX_LINE = 10_000_000

        private const val BATCH_ID_BYTES = 6

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
