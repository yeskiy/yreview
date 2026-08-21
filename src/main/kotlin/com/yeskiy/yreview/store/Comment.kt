package com.yeskiy.yreview.store

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.MessageDigest

@Serializable
data class Range(
    val startLine: Int,
    val startColumn: Int = 0,
    val endLine: Int,
    val endColumn: Int = 0,
)

@Serializable
data class Location(
    val commit: String,
    val path: String,
    val range: Range? = null,
)

@Serializable
data class Comment(
    val timestamp: String,
    val author: String,
    val description: String? = null,
    val parent: String? = null,
    val original: String? = null,
    val resolved: Boolean? = null,
    val location: Location? = null,
    val v: Int = 0,
)

object CommentJson {
    private val json = Json {
        prettyPrint = false
        encodeDefaults = false
        explicitNulls = false
        ignoreUnknownKeys = true
    }

    fun encode(comment: Comment): String = json.encodeToString(Comment.serializer(), comment)

    fun decode(line: String): Comment = json.decodeFromString(Comment.serializer(), line)
}

fun Comment.id(): String {
    val digest = MessageDigest.getInstance("SHA-1").digest(CommentJson.encode(this).toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}
