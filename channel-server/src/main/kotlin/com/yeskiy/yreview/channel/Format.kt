package com.yeskiy.yreview.channel

/**
 * Turns one batch into the text and the attributes that the model reads.
 *
 * The first line of a comment names the short id, the file, the range, and the revision.
 * The lines after it hold the comment. A blank line divides two comments.
 * A comment on a part of a line names the character position of each end.
 */
object Format {

    private const val SHORT_LENGTH = 7

    private val META_KEY = Regex("^[A-Za-z0-9_]+$")

    private fun short(value: String): String = value.take(SHORT_LENGTH)

    private fun revisionLabel(comment: ReviewComment, headCommit: String): String =
        if (comment.revision == "HEAD" || comment.revision == headCommit) "HEAD" else short(comment.revision)

    private fun sideLabel(comment: ReviewComment): String =
        if (comment.side == Side.LEFT) " (left side of the diff)" else ""

    // The same rule stands in RangeText.kt of the plugin. Keep the two copies equal.
    private fun range(comment: ReviewComment): String =
        if ((comment.startColumn ?: 0) != 0 || (comment.endColumn ?: 0) != 0) {
            "${comment.startLine}:${comment.startColumn ?: 0}-${comment.endLine}:${comment.endColumn ?: 0}"
        } else {
            "${comment.startLine}-${comment.endLine}"
        }

    private fun format(comment: ReviewComment, headCommit: String): String =
        "[${short(comment.id)}] ${comment.path}:${range(comment)}" +
            " @${revisionLabel(comment, headCommit)}${sideLabel(comment)}\n${comment.text.trim()}"

    fun batchContent(batch: ReviewBatch): String =
        batch.comments.joinToString("\n\n") { format(it, batch.commit) }

    /**
     * Claude Code writes each entry as an attribute of the channel tag. A key outside the
     * safe set goes away, and a quotation mark inside a value would end the attribute.
     */
    fun sanitizeMeta(meta: Map<String, Any?>): Map<String, String> = meta.asSequence()
        .filter { (key, value) -> META_KEY.matches(key) && value is String }
        .map { (key, value) -> key to (value as String).filterNot { it == '"' || BatchSchema.isControl(it) } }
        .filter { (_, value) -> value.isNotEmpty() }
        .toMap()

    fun batchMeta(batch: ReviewBatch): Map<String, String> = sanitizeMeta(
        mapOf(
            "branch" to batch.branch,
            "commit" to batch.commit,
            "count" to batch.comments.size.toString(),
            "batch_id" to batch.batchId,
        ),
    )
}
