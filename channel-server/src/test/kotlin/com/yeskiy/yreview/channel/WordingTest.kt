package com.yeskiy.yreview.channel

import io.modelcontextprotocol.kotlin.sdk.ExperimentalMcpApi
import io.modelcontextprotocol.kotlin.sdk.client.Client
import io.modelcontextprotocol.kotlin.sdk.testing.ChannelTransport
import io.modelcontextprotocol.kotlin.sdk.types.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.TextContent
import kotlinx.coroutines.runBlocking
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** The exact words that the model reads after one report. */
@OptIn(ExperimentalMcpApi::class)
class WordingTest {

    private val batch = ReviewBatch(
        batchId = "b7f2a91",
        branch = "main",
        commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments = listOf(
            ReviewComment("aaaaaaa1111111111111111111111111111111111", "a.kt", 1, 1, "HEAD", null, "one"),
            ReviewComment("bbbbbbb2222222222222222222222222222222222", "b.kt", 2, 2, "HEAD", null, "two"),
        ),
    )

    private var channel: ReviewChannel? = null

    @AfterTest
    fun tearDown() {
        runBlocking { channel?.close() }
    }

    private suspend fun setUp(): Client {
        val channel = ReviewChannel { }
        this.channel = channel
        val client = Client(Implementation(name = "test-client", version = "0.0.0"))
        val pair = ChannelTransport.createLinkedPair()
        channel.connect(pair.serverTransport)
        client.connect(pair.clientTransport)
        channel.push(batch)
        return client
    }

    private fun textOf(result: CallToolResult): String =
        result.content.filterIsInstance<TextContent>().joinToString("\n") { it.text }

    @Test
    fun `counts one comment in the singular`() = runBlocking<Unit> {
        val client = setUp()
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("aaaaaaa")))

        assertEquals("Reported 1 comment to the IDE as resolved.", textOf(result))
    }

    @Test
    fun `counts two comments in the plural`() = runBlocking<Unit> {
        val client = setUp()
        val result = client.callTool(ReviewChannel.TOOL_NAME, mapOf("ids" to listOf("aaaaaaa", "bbbbbbb")))

        assertEquals("Reported 2 comments to the IDE as resolved.", textOf(result))
    }
}
