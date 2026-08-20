package com.yeskiy.ideareview.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * One comment as the channel reads it. The field names, the order, and the limits come
 * from channel/src/schema.ts. That schema is strict, so a field it does not name makes
 * the channel drop the whole batch.
 */
@Serializable
data class BatchComment(
    val id: String,
    val path: String,
    val startLine: Int,
    val endLine: Int,
    val revision: String,
    val side: String? = null,
    val text: String,
)

@Serializable
data class ReviewBatch(
    val batchId: String,
    val branch: String,
    val commit: String,
    val comments: List<BatchComment>,
)

object BatchJson {

    private val json = Json {
        prettyPrint = false
        encodeDefaults = false
        explicitNulls = false
    }

    /** Writes the batch on one line, because one Server-Sent Event carries one batch. */
    fun encode(batch: ReviewBatch): String = json.encodeToString(ReviewBatch.serializer(), batch)
}
