package com.yeskiy.yreview.channel

import io.modelcontextprotocol.kotlin.sdk.ExperimentalMcpApi
import io.modelcontextprotocol.kotlin.sdk.client.Client
import io.modelcontextprotocol.kotlin.sdk.testing.ChannelTransport
import io.modelcontextprotocol.kotlin.sdk.types.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.JSONRPCNotification
import io.modelcontextprotocol.kotlin.sdk.types.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Collections
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalMcpApi::class)
class ReviewChannelTest {

    private val batch = ReviewBatch(
        batchId = "b7f2a91",
        branch = "feat/channel-server",
        commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments = listOf(
            ReviewComment(
                id = "c3f9a12aabbccddeeff00112233445566778899a",
                path = "src/main/kotlin/Parser.kt",
                startLine = 88,
                endLine = 94,
                revision = "HEAD",
                text = "This branch never runs when the input is empty. Add the guard before the loop.",
            ),
            ReviewComment(
                id = "a7710de0011223344556677889900aabbccddeef",
                path = "src/main/kotlin/Lexer.kt",
                startLine = 12,
                endLine = 12,
                revision = "1111111000000000000000000000000000000000",
                side = Side.LEFT,
                text = "This was already wrong before the change. Fix it in the same pass.",
            ),
        ),
    )

    private val reported: MutableList<List<String>> = Collections.synchronizedList(mutableListOf())

    private val failures: MutableList<String> = Collections.synchronizedList(mutableListOf())

    private val notifications: MutableList<JSONRPCNotification> = Collections.synchronizedList(mutableListOf())

    private var channel: ReviewChannel? = null

    @AfterTest
    fun tearDown() {
        runBlocking { channel?.close() }
    }

    private suspend fun setUp(): Client {
        val channel = ReviewChannel { ids ->
            failures.firstOrNull()?.let { throw IllegalStateException(it) }
            reported.add(ids.toList())
        }
        this.channel = channel
        val client = Client(Implementation(name = "test-client", version = "0.0.0"))
        client.fallbackNotificationHandler = { notification -> notifications.add(notification) }
        val pair = ChannelTransport.createLinkedPair()
        channel.connect(pair.serverTransport)
        client.connect(pair.clientTransport)
        return client
    }

    private suspend fun push(batch: ReviewBatch) {
        val before = notifications.size
        channel!!.push(batch)
        if (batch.comments.isNotEmpty()) {
            FakeBridge.waitFor("the notification") { notifications.size > before }
        }
    }

    private fun textOf(result: CallToolResult): String =
        result.content.filterIsInstance<TextContent>().joinToString("\n") { it.text }

    private fun paramsOf(notification: JSONRPCNotification): JsonObject = notification.params!!.jsonObject

    @Test
    fun `declares the claude channel capability`() = runBlocking<Unit> {
        val client = setUp()

        assertNotNull(client.serverCapabilities?.experimental?.get(ReviewChannel.CHANNEL_CAPABILITY))
    }

    @Test
    fun `declares the tools capability so the reply tool is discovered`() = runBlocking<Unit> {
        val client = setUp()

        assertNotNull(client.serverCapabilities?.tools)
    }

    @Test
    fun `sends instructions that name the review_resolve tool`() = runBlocking<Unit> {
        val client = setUp()

        assertContains(client.serverInstructions.orEmpty(), ReviewChannel.TOOL_NAME)
    }

    @Test
    fun `is named y-review so the source attribute reads y-review`() {
        assertEquals("y-review", ReviewChannel.SERVER_NAME)
    }

    @Test
    fun `offers the review_resolve tool with an ids array`() = runBlocking<Unit> {
        val client = setUp()
        val tool = client.listTools().tools.first { it.name == ReviewChannel.TOOL_NAME }

        assertNotNull(tool.inputSchema.properties?.get("ids"))
        assertEquals(listOf("ids"), tool.inputSchema.required)
    }

    @Test
    fun `emits one notification for one batch`() = runBlocking<Unit> {
        setUp()
        push(batch)

        assertEquals(1, notifications.size)
    }

    @Test
    fun `emits the notification under the channel method`() = runBlocking<Unit> {
        setUp()
        push(batch)

        assertEquals(ReviewChannel.CHANNEL_METHOD, notifications[0].method)
        assertEquals("notifications/claude/channel", ReviewChannel.CHANNEL_METHOD)
    }

    @Test
    fun `puts the formatted comments in the content field`() = runBlocking<Unit> {
        setUp()
        push(batch)

        assertEquals(
            "[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n" +
                "This branch never runs when the input is empty. Add the guard before the loop.\n" +
                "\n" +
                "[a7710de] src/main/kotlin/Lexer.kt:12-12 @1111111 (left side of the diff)\n" +
                "This was already wrong before the change. Fix it in the same pass.",
            paramsOf(notifications[0])["content"]!!.jsonPrimitive.content,
        )
    }

    @Test
    fun `puts the branch, the commit, the count, and the batch id in the meta field`() = runBlocking<Unit> {
        setUp()
        push(batch)
        val meta = paramsOf(notifications[0])["meta"]!!.jsonObject

        assertEquals(setOf("branch", "commit", "count", "batch_id"), meta.keys)
        assertEquals("feat/channel-server", meta["branch"]!!.jsonPrimitive.content)
        assertEquals("4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6", meta["commit"]!!.jsonPrimitive.content)
        assertEquals("2", meta["count"]!!.jsonPrimitive.content)
        assertEquals("b7f2a91", meta["batch_id"]!!.jsonPrimitive.content)
    }

    @Test
    fun `does not emit a notification for a batch with no comments`() = runBlocking<Unit> {
        setUp()
        push(batch.copy(comments = emptyList()))

        assertEquals(0, notifications.size)
    }

    @Test
    fun `reports the full id to the bridge when the model gives the short id`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12")))

        assertEquals(listOf(listOf("c3f9a12aabbccddeeff00112233445566778899a")), reported.toList())
    }

    @Test
    fun `reports the full id to the bridge when the model gives the full id`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("a7710de0011223344556677889900aabbccddeef")))

        assertEquals(listOf(listOf("a7710de0011223344556677889900aabbccddeef")), reported.toList())
    }

    @Test
    fun `reports several ids in one call to the bridge`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12", "a7710de")))

        assertEquals(
            listOf(
                listOf(
                    "c3f9a12aabbccddeeff00112233445566778899a",
                    "a7710de0011223344556677889900aabbccddeef",
                ),
            ),
            reported.toList(),
        )
    }

    @Test
    fun `does not report an id that matches no open comment`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12", "ffffff0")))

        assertEquals(listOf(listOf("c3f9a12aabbccddeeff00112233445566778899a")), reported.toList())
    }

    @Test
    fun `names the id that matches no open comment in the tool result`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12", "ffffff0")))

        assertContains(textOf(result), "ffffff0")
    }

    @Test
    fun `fails the tool call when no id matches an open comment`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("ffffff0")))

        assertEquals(true, result.isError)
    }

    @Test
    fun `does not report an id that several open comments match`() = runBlocking<Unit> {
        val client = setUp()
        push(
            batch.copy(
                comments = listOf(
                    ReviewComment("dd11111111111111111111111111111111111111", "a.kt", 1, 1, "HEAD", null, "one"),
                    ReviewComment("dd22222222222222222222222222222222222222", "b.kt", 2, 2, "HEAD", null, "two"),
                ),
            ),
        )
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("dd")))

        assertEquals(true, result.isError)
        assertEquals(emptyList(), reported.toList())
    }

    @Test
    fun `forgets a comment after the bridge accepted it`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12")))
        val again = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12")))

        assertEquals(true, again.isError)
    }

    @Test
    fun `keeps the comment open when the bridge call fails`() = runBlocking<Unit> {
        val client = setUp()
        push(batch)
        failures.add("the bridge is gone")
        val failed = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12")))

        assertEquals(true, failed.isError)
        assertContains(textOf(failed), "the bridge is gone")

        failures.clear()
        client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12")))

        assertEquals(listOf(listOf("c3f9a12aabbccddeeff00112233445566778899a")), reported.toList())
    }

    @Test
    fun `rejects a call that carries no ids`() = runBlocking<Unit> {
        val client = setUp()
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to emptyList<String>()))

        assertEquals(true, result.isError)
    }

    @Test
    fun `drops the oldest batch when too many batches stay open`() = runBlocking<Unit> {
        val client = setUp()
        val count = ReviewChannel.MAX_OPEN_BATCHES + 8
        (0 until count).forEach { index ->
            push(
                batch.copy(
                    batchId = "batch$index",
                    comments = listOf(
                        ReviewComment(
                            id = index.toString().padStart(4, '0') + "aaaabbbbccccddddeeeeffff00001111",
                            path = "a.kt",
                            startLine = 1,
                            endLine = 1,
                            revision = "HEAD",
                            text = "one",
                        ),
                    ),
                ),
            )
        }
        val oldest = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("0000aaa")))
        val newest = client.callTool(
            ReviewChannel.TOOL_NAME,
            mapOf("ids" to listOf((count - 1).toString().padStart(4, '0') + "aaa")),
        )

        assertEquals(true, oldest.isError)
        assertNull(newest.isError)
        assertTrue(notifications.size == count, "every batch must reach the model")
    }
}
