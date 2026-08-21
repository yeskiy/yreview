package com.yeskiy.yreview.channel

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import java.util.Collections
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class BridgeClientTest {

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
                text = "This branch never runs when the input is empty.",
            ),
        ),
    )

    private val bridge = FakeBridge()

    private val batches: MutableList<ReviewBatch> = Collections.synchronizedList(mutableListOf())

    private val errors: MutableList<Throwable> = Collections.synchronizedList(mutableListOf())

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var client: BridgeClient? = null

    private fun connect(token: String = bridge.token): BridgeClient = BridgeClient(
        bridgeUrl = bridge.url,
        token = token,
        onError = { errors.add(it) },
        retryDelayMs = 20,
    ).also {
        client = it
        it.start(scope) { pushed -> batches.add(pushed) }
    }

    @AfterTest
    fun tearDown() {
        runBlocking { client?.stop() }
        scope.cancel()
        bridge.close()
    }

    @Test
    fun `receives a batch that the bridge pushed`() {
        connect()
        bridge.waitForStream()
        bridge.push(batch)
        FakeBridge.waitFor("the batch") { batches.size == 1 }

        assertEquals("b7f2a91", batches[0].batchId)
    }

    @Test
    fun `sends the token on the events request`() {
        connect()
        bridge.waitForStream()

        assertEquals(listOf(bridge.token), bridge.streamTokens.toList())
    }

    @Test
    fun `reports an error when the bridge refuses the token`() {
        connect(token = "a-wrong-token-of-32-characters-00")
        FakeBridge.waitFor("the error") { errors.isNotEmpty() }

        assertContains(errors[0].message.orEmpty(), "401")
    }

    @Test
    fun `reports an error and keeps the stream open when a batch does not match the contract`() {
        connect()
        bridge.waitForStream()
        bridge.pushRaw("""{"batchId":"b1","branch":"main"}""")
        FakeBridge.waitFor("the error") { errors.isNotEmpty() }
        bridge.push(batch)
        FakeBridge.waitFor("the good batch") { batches.size == 1 }

        assertEquals("b7f2a91", batches[0].batchId)
    }

    @Test
    fun `reports an error when a pushed event is not JSON`() {
        connect()
        bridge.waitForStream()
        bridge.pushRaw("this is not json")
        FakeBridge.waitFor("the error") { errors.isNotEmpty() }

        assertEquals(1, errors.size)
        assertContains(errors[0].message.orEmpty(), "not JSON")
    }

    @Test
    fun `opens the stream again after the bridge dropped it`() {
        connect()
        bridge.waitForStream()
        bridge.dropStreams()
        FakeBridge.waitFor("the second stream") { bridge.streamTokens.size == 2 }
        bridge.waitForStream()
        bridge.push(batch)
        FakeBridge.waitFor("the batch after the reconnect") { batches.size == 1 }

        assertEquals(1, batches.size)
    }

    @Test
    fun `posts the resolved ids to the bridge`() {
        val client = connect()
        runBlocking { client.resolve(listOf(fullId)) }

        assertEquals(listOf(listOf(fullId)), bridge.resolved.toList())
    }

    @Test
    fun `sends the token on the resolve request`() {
        val client = connect()
        runBlocking { client.resolve(listOf(fullId)) }

        assertEquals(listOf(bridge.token), bridge.resolveTokens.toList())
    }

    @Test
    fun `fails the resolve call when the bridge refuses the token`() {
        val client = connect(token = "a-wrong-token-of-32-characters-00")
        val failure = assertFailsWith<Exception> { runBlocking { client.resolve(listOf(fullId)) } }

        assertContains(failure.message.orEmpty(), "401")
    }

    @Test
    fun `fails the resolve call when the bridge is gone`() {
        val client = connect()
        bridge.close()
        val failure = assertFailsWith<Exception> { runBlocking { client.resolve(listOf(fullId)) } }

        assertTrue(failure.message.orEmpty().isNotEmpty(), "the reason must reach the caller")
    }
}
