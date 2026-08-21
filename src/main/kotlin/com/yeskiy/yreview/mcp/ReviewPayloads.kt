package com.yeskiy.yreview.mcp

import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.StoredComment
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class CommentRow(
    val id: String,
    val path: String,
    val startLine: Int,
    val endLine: Int,
    val revision: String,
    val author: String,
    val text: String,
    val shared: Boolean,
    val resolved: Boolean,
)

@Serializable
private data class CommentListPayload(val comments: List<CommentRow>)

@Serializable
private data class AddedPayload(val id: String, val path: String, val revision: String, val shared: Boolean)

@Serializable
private data class ResolvedPayload(val id: String, val resolved: Boolean)

@Serializable
private data class OpenedPayload(
    val id: String,
    val opened: String,
    val path: String,
    val line: Int,
    val revision: String,
)

@Serializable
private data class ErrorPayload(val error: String)

/**
 * Shapes every tool answer as one JSON text.
 *
 * The tools return a string, not a data class. The MCP server uses the copy of the kotlin
 * serialization runtime that the platform holds. This plugin bundles a second copy. An
 * object of a plugin class therefore meets a serializer from the other copy and fails. A
 * string crosses safely, and the schema of a string needs no plugin class.
 */
object ReviewPayloads {

    private val json = Json {
        prettyPrint = false
        encodeDefaults = true
        explicitNulls = false
    }

    fun rowOf(stored: StoredComment, resolved: Boolean): CommentRow? {
        val location = stored.comment.location ?: return null
        return CommentRow(
            id = stored.id,
            path = location.path,
            startLine = location.range?.startLine ?: 0,
            endLine = location.range?.endLine ?: 0,
            revision = location.commit,
            author = stored.comment.author,
            text = stored.comment.description.orEmpty(),
            shared = NoteRefs.isShared(stored.ref),
            resolved = resolved,
        )
    }

    fun list(rows: List<CommentRow>): String =
        json.encodeToString(CommentListPayload.serializer(), CommentListPayload(rows))

    fun added(id: String, path: String, revision: String, shared: Boolean): String =
        json.encodeToString(AddedPayload.serializer(), AddedPayload(id, path, revision, shared))

    fun resolved(id: String): String =
        json.encodeToString(ResolvedPayload.serializer(), ResolvedPayload(id, resolved = true))

    fun opened(id: String, opened: String, path: String, line: Int, revision: String): String =
        json.encodeToString(OpenedPayload.serializer(), OpenedPayload(id, opened, path, line, revision))

    fun error(message: String): String =
        json.encodeToString(ErrorPayload.serializer(), ErrorPayload(message))
}

/** Checks every value an agent sends before the plugin uses it. */
object ReviewArguments {

    private val WINDOWS_DRIVE = Regex("^[A-Za-z]:")
    private val REVISION = Regex("^[0-9a-fA-F]{7,64}$")

    /**
     * Tells whether the text is a git revision. A note travels with the repository, so its
     * revision is not trusted. The plugin checks the value before a git command uses it.
     */
    fun isRevision(text: String): Boolean = REVISION.matches(text)

    fun refsFor(includeAnalyses: Boolean, includeLocal: Boolean): List<String> =
        buildList {
            add(NoteRefs.DISCUSS)
            if (includeAnalyses) add(NoteRefs.ANALYSES)
            if (includeLocal) add(NoteRefs.LOCAL)
        }

    /**
     * Returns the path in a plain relative form, or null when the path is absolute, empty,
     * or points above the root. The caller then joins the result to a root it trusts.
     */
    fun normalizePath(raw: String): String? {
        val text = raw.trim().replace('\\', '/')
        if (text.isEmpty() || text.startsWith("/") || WINDOWS_DRIVE.containsMatchIn(text)) return null

        val parts = text.split('/').filter { it.isNotEmpty() && it != "." }
        val stack = mutableListOf<String>()
        parts.forEach { part ->
            when {
                part != ".." -> stack.add(part)
                stack.isEmpty() -> return null
                else -> stack.removeAt(stack.lastIndex)
            }
        }
        return stack.joinToString("/").ifEmpty { null }
    }

    /** Returns the problem with the line range, or null when the range is good. */
    fun rangeProblem(startLine: Int, endLine: Int): String? = when {
        startLine < 1 -> "startLine must be 1 or more."
        endLine < startLine -> "endLine must be equal to startLine or larger."
        else -> null
    }
}
