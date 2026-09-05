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
import kotlin.test.assertFalse
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

    private fun connect(token: String = bridge.token, sessionKey: String? = null): BridgeClient = BridgeClient(
        bridgeUrl = bridge.url,
        token = token,
        sessionKey = sessionKey,
        onError = { errors.add(it) },
        retryDelayMs = 20,
        resolveTimeoutMs = RESOLVE_TIMEOUT_MS,
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

    @Test
    fun `sends the session key on the event stream and on the resolve call`() {
        val client = connect(sessionKey = SESSION_KEY)
        bridge.waitForStream()
        runBlocking { client.resolve(listOf(fullId)) }

        assertEquals(listOf(SESSION_KEY), bridge.streamKeys.toList())
        assertEquals(listOf(SESSION_KEY), bridge.resolveKeys.toList())
    }

    @Test
    fun `sends no session header when it has no key`() {
        // A session that started before the key existed must still reach the bridge.
        val client = connect()
        bridge.waitForStream()
        runBlocking { client.resolve(listOf(fullId)) }

        assertEquals(listOf(""), bridge.streamKeys.toList())
        assertEquals(listOf(""), bridge.resolveKeys.toList())
    }

    @Test
    fun `gives up the resolve call when the bridge takes the report and never answers`() {
        bridge.stallResolve = true
        val client = connect()
        val started = System.currentTimeMillis()

        val failure = assertFailsWith<Exception> { runBlocking { client.resolve(listOf(fullId)) } }
        val waited = System.currentTimeMillis() - started

        assertContains(failure.message.orEmpty(), "did not answer")
        assertTrue(waited < GIVE_UP_MS, "the client waited $waited ms, and it must give up much sooner")
    }

    @Test
    fun `the reason of a resolve call that gave up carries no token`() {
        bridge.stallResolve = true
        val client = connect()

        val failure = assertFailsWith<Exception> { runBlocking { client.resolve(listOf(fullId)) } }

        assertFalse(failure.message.orEmpty().contains(bridge.token), "a message must never carry the token")
    }

    private companion object {
        const val SESSION_KEY = "aaaaaaaaaaaaaaaa"

        /** The bound this test gives the client. The stalled bridge holds its answer far longer. */
        const val RESOLVE_TIMEOUT_MS = 400L

        /** A client that never gave up would wait for the stalled bridge, which takes seconds. */
        const val GIVE_UP_MS = 3_000L
    }
}
