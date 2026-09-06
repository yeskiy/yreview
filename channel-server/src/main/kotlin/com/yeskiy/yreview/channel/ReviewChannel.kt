package com.yeskiy.yreview.channel

import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.ServerOptions
import io.modelcontextprotocol.kotlin.sdk.server.ServerSession
import io.modelcontextprotocol.kotlin.sdk.shared.Transport
import io.modelcontextprotocol.kotlin.sdk.types.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.JSONRPCNotification
import io.modelcontextprotocol.kotlin.sdk.types.McpException
import io.modelcontextprotocol.kotlin.sdk.types.RPCError
import io.modelcontextprotocol.kotlin.sdk.types.ServerCapabilities
import io.modelcontextprotocol.kotlin.sdk.types.TextContent
import io.modelcontextprotocol.kotlin.sdk.types.ToolSchema
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** The reply of the plugin to one report of the model. */
fun interface ResolveSink {

    suspend fun resolve(ids: List<String>)
}

/**
 * The Model Context Protocol side of the channel.
 *
 * The server declares the claude/channel capability, pushes one notification for each
 * batch, and offers one tool. The model calls that tool to report the comments it fixed.
 *
 * The server answers no method outside the small set that it registers. A server that
 * answers an unknown method negotiates the modern era of the protocol, and the channel
 * then carries nothing.
 */
class ReviewChannel(private val sink: ResolveSink) {

    /** The open comments of each batch, oldest batch first. */
    private val openBatches = LinkedHashMap<String, MutableSet<String>>()

    private val lock = Any()

    private var session: ServerSession? = null

    private val server = Server(
        serverInfo = Implementation(name = SERVER_NAME, version = SERVER_VERSION),
        options = ServerOptions(
            capabilities = ServerCapabilities(
                tools = ServerCapabilities.Tools(listChanged = true),
                experimental = buildJsonObject { putJsonObject(CHANNEL_CAPABILITY) { } },
            ),
        ),
        instructions = INSTRUCTIONS,
    )

    init {
        server.addTool(
            name = TOOL_NAME,
            description = RESOLVE_DESCRIPTION,
            inputSchema = inputSchema(),
            title = "Resolve review comments",
        ) { request -> report(request.arguments) }
    }

    suspend fun connect(transport: Transport) {
        session = server.createSession(transport).apply {
            fallbackRequestHandler = { _, _ ->
                throw McpException(code = RPCError.ErrorCode.METHOD_NOT_FOUND, message = "Method not found")
            }
        }
    }

    suspend fun close() {
        server.close()
        session = null
    }

    /** An empty batch reaches no model, because a channel event with no comment says nothing. */
    suspend fun push(batch: ReviewBatch) {
        if (batch.comments.isEmpty()) return
        remember(batch)
        session?.transport?.send(
            JSONRPCNotification(
                method = CHANNEL_METHOD,
                params = buildJsonObject {
                    put("content", Format.batchContent(batch))
                    putJsonObject("meta") {
                        Format.batchMeta(batch).forEach { (key, value) -> put(key, value) }
                    }
                },
            ),
        )
    }

    // --- The tool ---

    private suspend fun report(arguments: JsonObject?): CallToolResult {
        val given = readIds(arguments) ?: return text(BAD_INPUT, isError = true)
        val matches = given.map { match(it) }
        val wanted = matches.filterIsInstance<Match.Open>().map { it.id }.distinct()
        val unknown = matches.filterIsInstance<Match.Unknown>().map { it.given }
        val ambiguous = matches.filterIsInstance<Match.Ambiguous>().map { it.given }
        val notes = listOfNotNull(
            unknown.takeIf { it.isNotEmpty() }?.let { "No open comment matches these ids: ${it.joinToString(", ")}." },
            ambiguous.takeIf { it.isNotEmpty() }?.let {
                "Several open comments match these ids: ${it.joinToString(", ")}. Give more characters of the id."
            },
        )

        if (wanted.isEmpty()) {
            return text((listOf("Nothing was reported to the IDE.") + notes).joinToString(" "), isError = true)
        }
        return runCatching { sink.resolve(wanted) }
            .fold(
                onSuccess = {
                    forget(wanted)
                    val counted = if (wanted.size == 1) "comment" else "comments"
                    text((listOf("Reported ${wanted.size} $counted to the IDE as resolved.") + notes).joinToString(" "))
                },
                onFailure = { cause ->
                    val reason = cause.message ?: cause.toString()
                    text(
                        (listOf("The IDE did not accept the report, so the comments stay open. Reason: $reason.") + notes)
                            .joinToString(" "),
                        isError = true,
                    )
                },
            )
    }

    /** Null when the call carries no usable list of ids. */
    private fun readIds(arguments: JsonObject?): List<String>? {
        val array = arguments?.get("ids") as? JsonArray ?: return null
        if (array.isEmpty() || array.size > BatchSchema.MAX_COMMENTS) return null
        val ids = array.mapNotNull { (it as? JsonPrimitive)?.takeIf { value -> value.isString }?.content }
        if (ids.size != array.size) return null
        return ids.takeIf { all -> all.all { it.isNotEmpty() && it.length <= BatchSchema.MAX_NAME } }
    }

    private sealed interface Match {

        data class Open(val id: String) : Match

        data class Unknown(val given: String) : Match

        data class Ambiguous(val given: String) : Match
    }

    /**
     * A full id wins. One open comment that starts with the given text also wins.
     *
     * With no open batch the server knows nothing about the work of this session, so it
     * passes the given text on and the IDE decides. An agent that takes no push reads the
     * ids from tasks.json, and this is the only way those ids reach the IDE.
     */
    private fun match(given: String): Match = synchronized(lock) {
        val open = openBatches.values.flatten()
        if (open.isEmpty()) return Match.Open(given)
        val prefixed = open.filter { it.startsWith(given) }
        when {
            open.contains(given) -> Match.Open(given)
            prefixed.size == 1 -> Match.Open(prefixed.first())
            prefixed.isEmpty() -> Match.Unknown(given)
            else -> Match.Ambiguous(given)
        }
    }

    private fun forget(ids: List<String>) = synchronized(lock) {
        openBatches.values.forEach { it.removeAll(ids.toSet()) }
        openBatches.entries.removeIf { it.value.isEmpty() }
    }

    /** A new batch goes last, and the oldest batches beyond the limit go away. */
    private fun remember(batch: ReviewBatch) = synchronized(lock) {
        openBatches.remove(batch.batchId)
        openBatches[batch.batchId] = batch.comments.mapTo(LinkedHashSet()) { it.id }
        val extra = openBatches.size - MAX_OPEN_BATCHES
        if (extra > 0) openBatches.keys.take(extra).forEach { openBatches.remove(it) }
    }

    private fun text(value: String, isError: Boolean = false): CallToolResult =
        CallToolResult(content = listOf(TextContent(value)), isError = if (isError) true else null)

    private fun inputSchema(): ToolSchema = ToolSchema(
        properties = buildJsonObject {
            putJsonObject("ids") {
                put("type", "array")
                putJsonObject("items") {
                    put("type", "string")
                    put("minLength", 1)
                    put("maxLength", BatchSchema.MAX_NAME)
                }
                put("minItems", 1)
                put("maxItems", BatchSchema.MAX_COMMENTS)
                put("description", "The ids of the comments that you fixed, copied from the channel event")
            }
        },
        required = listOf("ids"),
    )

    companion object {

        /** The channel event carries the server name, so this name reaches the model. */
        const val SERVER_NAME = "y-review"

        const val SERVER_VERSION = "0.1.0"

        const val CHANNEL_METHOD = "notifications/claude/channel"

        const val CHANNEL_CAPABILITY = "claude/channel"

        const val TOOL_NAME = "review_resolve"

        const val MAX_OPEN_BATCHES = 32

        const val BAD_INPUT = "The call carried no usable ids, so nothing was reported to the IDE. " +
            "Give an array of one id or more, and copy each id from the channel event."

        val INSTRUCTIONS = listOf(
            "The y-review channel carries code review comments from IntelliJ IDEA.",
            "Each event arrives as a channel tag with the source attribute set to y-review.",
            "The attributes give the branch, the commit, the comment count, and the batch id.",
            "The body of the tag lists the comments. A blank line divides two comments.",
            "The first line of a comment has this form:",
            "[id] path:startLine-endLine @revision",
            "A comment on a part of a line has this form instead:",
            "[id] path:startLine:startColumn-endLine:endColumn @revision",
            "A column is a zero based character position in a line.",
            "The end column names the character after the last character of the comment.",
            "The revision HEAD means that the comment matches the file as it is now.",
            "Any other revision is an older commit.",
            "Read that revision with the command git show <revision>:<path> before you judge the code.",
            "The mark (left side of the diff) means that the comment is on the removed side of a diff.",
            "The lines after the first line hold the text of the comment.",
            "Do these steps for each event:",
            "1. Read every comment in the body.",
            "2. Make the change that the comment asks for.",
            "3. Call review_resolve with the ids of the comments that you fixed.",
            "Copy each id exactly as the event shows it.",
            "An id also comes from the tasks.json file of the review folder, when no channel event arrived.",
            "Do not call review_resolve for a comment that you did not fix.",
            "Tell the person which comments you left open, and why.",
        ).joinToString("\n")

        val RESOLVE_DESCRIPTION = listOf(
            "Report the review comments that you fixed.",
            "The IDE marks each id as resolved and removes it from the review list.",
            "Copy each id from the channel event without a change.",
            "Report a comment only after you made the change that it asks for.",
        ).joinToString(" ")
    }
}
