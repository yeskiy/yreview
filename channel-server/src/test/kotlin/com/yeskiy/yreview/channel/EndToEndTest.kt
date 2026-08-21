package com.yeskiy.yreview.channel

import io.modelcontextprotocol.kotlin.sdk.ExperimentalMcpApi
import io.modelcontextprotocol.kotlin.sdk.client.Client
import io.modelcontextprotocol.kotlin.sdk.testing.ChannelTransport
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.JSONRPCNotification
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Collections
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The channel wired to a bridge, the same way that one review session runs. */
@OptIn(ExperimentalMcpApi::class)
class EndToEndTest {

    private val fullId = "c3f9a12aabbccddeeff00112233445566778899a"

    private val batch = ReviewBatch(
        batchId = "b7f2a91",
        branch = "feat/channel-server",
        commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments = listOf(
            ReviewComment(
                id = fullId,
                path = "src/main/kotlin/Parser.kt",
                startLine = 88,
                endLine = 94,
                revision = "HEAD",
                text = "This branch never runs when the input is empty. Add the guard before the loop.",
            ),
        ),
    )

    private val bridge = FakeBridge()

    private val errors: MutableList<Throwable> = Collections.synchronizedList(mutableListOf())

    private val notifications: MutableList<JSONRPCNotification> = Collections.synchronizedList(mutableListOf())

    private var app: ChannelApp? = null

    @AfterTest
    fun tearDown() {
        runBlocking { app?.stop() }
        bridge.close()
    }

    private suspend fun setUp(): Client {
        val app = ChannelApp(
            config = BridgeConfig(bridgeUrl = bridge.url, token = bridge.token),
            onError = { errors.add(it) },
            retryDelayMs = 20,
        )
        this.app = app
        val client = Client(Implementation(name = "test-client", version = "0.0.0"))
        client.fallbackNotificationHandler = { notification -> notifications.add(notification) }
        val pair = ChannelTransport.createLinkedPair()
        app.connect(pair.serverTransport)
        client.connect(pair.clientTransport)
        bridge.waitForStream()
        return client
    }

    @Test
    fun `turns a batch from the bridge into one channel notification`() = runBlocking<Unit> {
        setUp()
        bridge.push(batch)
        FakeBridge.waitFor("the notification") { notifications.isNotEmpty() }
        val params = notifications[0].params!!.jsonObject

        assertEquals("notifications/claude/channel", notifications[0].method)
        assertEquals(
            "[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n" +
                "This branch never runs when the input is empty. Add the guard before the loop.",
            params["content"]!!.jsonPrimitive.content,
        )
        val meta = params["meta"]!!.jsonObject
        assertEquals(setOf("branch", "commit", "count", "batch_id"), meta.keys)
        assertEquals("feat/channel-server", meta["branch"]!!.jsonPrimitive.content)
        assertEquals("1", meta["count"]!!.jsonPrimitive.content)
        assertEquals("b7f2a91", meta["batch_id"]!!.jsonPrimitive.content)
    }

    @Test
    fun `sends the full id back to the bridge when the model resolves the short id`() = runBlocking<Unit> {
        val client = setUp()
        bridge.push(batch)
        FakeBridge.waitFor("the notification") { notifications.isNotEmpty() }
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("c3f9a12")))

        assertNull(result.isError)
        assertEquals(listOf(listOf(fullId)), bridge.resolved.toList())
    }

    @Test
    fun `reports a batch that does not match the contract without stopping the stream`() = runBlocking<Unit> {
        setUp()
        bridge.pushRaw("""{"batchId":"b1"}""")
        FakeBridge.waitFor("the error") { errors.isNotEmpty() }
        bridge.push(batch)
        FakeBridge.waitFor("the good notification") { notifications.isNotEmpty() }

        assertEquals(1, notifications.size)
    }
}
