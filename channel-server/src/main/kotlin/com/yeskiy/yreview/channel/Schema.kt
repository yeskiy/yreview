package com.yeskiy.yreview.channel

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The side of a diff that carries the comment. */
@Serializable
enum class Side {
    @SerialName("left")
    LEFT,

    @SerialName("right")
    RIGHT,
}

@Serializable
data class ReviewComment(
    val id: String,
    val path: String,
    val startLine: Int,
    val startColumn: Int? = null,
    val endLine: Int,
    val endColumn: Int? = null,
    val revision: String,
    val side: Side? = null,
    val text: String,
)

@Serializable
data class ReviewBatch(
    val batchId: String,
    val branch: String,
    val commit: String,
    val comments: List<ReviewComment>,
)

/** What one read of an event of the bridge produced. */
sealed interface BatchParse {

    data class Ok(val batch: ReviewBatch) : BatchParse

    data class Bad(val reason: String) : BatchParse
}

/**
 * The contract between the plugin and the channel.
 *
 * The same rule stands in BatchBuilder.kt. Keep the two copies equal. The rules guard the
 * text that reaches the model, so a line break never leaves a field of one comment.
 */
object BatchSchema {

    const val MAX_COMMENTS = 200

    const val MAX_TEXT = 20_000

    const val MAX_PATH = 1024

    const val MAX_BRANCH = 255

    const val MAX_LINE = 10_000_000

    const val MAX_NAME = 200

    private val OPAQUE_ID = Regex("^[A-Za-z0-9_-]+$")

    private val REVISION = Regex("^[A-Za-z0-9._/-]+$")

    private val JSON = Json { ignoreUnknownKeys = false }

    /** The characters that a plain line must not hold. A line break splits one comment. */
    fun isControl(value: Char): Boolean = value.code < 0x20 || value.code == 0x7f

    /** A field that the contract does not name makes the read fail, and so does a bad type. */
    fun parse(text: String): BatchParse {
        val batch = try {
            JSON.decodeFromString<ReviewBatch>(text)
        } catch (cause: Exception) {
            return BatchParse.Bad(cause.message ?: "the value does not match the contract")
        }
        return check(batch)?.let { BatchParse.Bad(it) } ?: BatchParse.Ok(batch)
    }

    /** Null when the batch follows the contract, and the reason when it does not. */
    fun check(batch: ReviewBatch): String? =
        opaqueId("batchId", batch.batchId)
            ?: plainLine("branch", batch.branch, MAX_BRANCH)
            ?: revision("commit", batch.commit)
            ?: count("comments", batch.comments.size, 1, MAX_COMMENTS)
            ?: batch.comments.firstNotNullOfOrNull { check(it) }

    private fun check(comment: ReviewComment): String? =
        opaqueId("id", comment.id)
            ?: plainLine("path", comment.path, MAX_PATH)
            ?: line("startLine", comment.startLine)
            ?: comment.startColumn?.let { line("startColumn", it) }
            ?: line("endLine", comment.endLine)
            ?: comment.endColumn?.let { line("endColumn", it) }
            ?: revision("revision", comment.revision)
            ?: count("text", comment.text.length, 1, MAX_TEXT)

    private fun count(field: String, value: Int, low: Int, high: Int): String? =
        if (value in low..high) null else "$field must hold between $low and $high entries, and it holds $value"

    private fun opaqueId(field: String, value: String): String? = count(field, value.length, 1, MAX_NAME)
        ?: if (OPAQUE_ID.matches(value)) null else "$field may hold letters, digits, underscores, and hyphens only"

    private fun revision(field: String, value: String): String? = count(field, value.length, 1, MAX_NAME)
        ?: if (REVISION.matches(value)) {
            null
        } else {
            "$field may hold letters, digits, dots, underscores, slashes, and hyphens only"
        }

    private fun plainLine(field: String, value: String, max: Int): String? = count(field, value.length, 1, max)
        ?: if (value.any { isControl(it) }) "$field must not hold a control character" else null

    private fun line(field: String, value: Int): String? =
        if (value in 0..MAX_LINE) null else "$field must hold a whole number between 0 and $MAX_LINE"
}
