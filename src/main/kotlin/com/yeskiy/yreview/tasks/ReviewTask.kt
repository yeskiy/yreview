package com.yeskiy.yreview.tasks

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.Json
import java.security.MessageDigest

@Serializable
enum class TaskKind {

    @SerialName("comment")
    COMMENT,

    @SerialName("todo")
    TODO,
}

/**
 * One open task of the review tool window.
 *
 * The first fields go to tasks.json, so an agent outside the IDE reads them. The fields
 * after them stay in memory. The tree needs a file path, and the channel needs a git
 * revision. An agent needs neither one.
 *
 * A comment on whole lines carries no column. A comment on a part of a line carries the
 * zero based character position of each end. The end column names the character after the
 * last character of the comment. A TODO always names whole lines.
 *
 * The module carries the name of the IDE module that holds the file, and it is empty when
 * the file sits outside every module. The pattern rule is the rule text of the TODO
 * pattern that matched, as the user wrote it under Settings, Editor, TODO. The tree takes
 * the icon, the color and the filter of a row from that rule.
 */
@Serializable
data class ReviewTask(
    val id: String,
    val kind: TaskKind,
    val path: String,
    val startLine: Int,
    val startColumn: Int? = null,
    val endLine: Int,
    val endColumn: Int? = null,
    val text: String,
    val pattern: String? = null,
    val author: String? = null,
    @Transient val filePath: String = "",
    @Transient val rootPath: String = "",
    @Transient val revision: String = "",
    @Transient val state: String = "",
    @Transient val module: String = "",
    @Transient val patternRule: String = "",
)

/**
 * The identifiers of a task.
 *
 * One identifier serves two routes. The channel reads it, and an agent writes it back to
 * done.txt. The channel accepts letters, digits, underscores and hyphens only, so every
 * identifier the plugin makes stays inside that set. See [isSafe].
 */
object TaskIds {

    const val TODO_PREFIX = "todo-"

    private val SAFE = Regex("^[A-Za-z0-9_-]{1,200}$")

    private val COMMENT = Regex("^[0-9a-f]{40}$")

    private val TODO = Regex("^todo-[0-9a-f]{40}-[0-9]{1,7}$")

    /** True when the channel accepts this identifier. The rule comes from the schema. */
    fun isSafe(id: String): Boolean = SAFE.matches(id)

    /**
     * True when the plugin itself could have made this identifier.
     *
     * An identifier that comes back from an agent goes through this test first. The test
     * refuses a git option and a path, because both start with a character no identifier
     * of the plugin starts with.
     */
    fun isKnown(id: String): Boolean = COMMENT.matches(id) || TODO.matches(id)

    fun isTodo(id: String): Boolean = id.startsWith(TODO_PREFIX)

    /** The identifier of one TODO line. It changes when the line moves, and that is correct. */
    fun forTodo(path: String, line: Int): String = "$TODO_PREFIX${sha1(path)}-$line"

    private fun sha1(value: String): String =
        MessageDigest.getInstance("SHA-1").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}

/** The tasks of one send, as the file protocol writes them. */
@Serializable
data class TaskDocument(
    val version: Int = 1,
    val repository: String,
    val commit: String,
    val generated: String,
    val tasks: List<ReviewTask>,
)

object TaskJson {

    private val json = Json {
        prettyPrint = true
        encodeDefaults = true
        explicitNulls = false
        ignoreUnknownKeys = true
    }

    fun encode(document: TaskDocument): String = json.encodeToString(TaskDocument.serializer(), document)

    fun decode(text: String): TaskDocument = json.decodeFromString(TaskDocument.serializer(), text)
}
