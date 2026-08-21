package com.yeskiy.yreview.bridge

import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BridgeServerTest {

    private val fullId = "c3f9a12aabbccddeeff00112233445566778899a"

    private val reported = mutableListOf<List<String>>()

    private var refusal: String? = null

    private val server = BridgeServer { ids ->
        reported.add(ids)
        refusal
    }

    private val address = server.start()

    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    @AfterTest
    fun tearDown() {
        client.shutdownNow()
        server.stop()
    }

    private val batch = ReviewBatch(
        batchId = "b7f2a91",
        branch = "main",
        commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments = listOf(
            BatchComment(
                id = fullId,
                path = "src/main/kotlin/Parser.kt",
                startLine = 88,
                endLine = 94,
                revision = "HEAD",
                text = "Add the guard before the loop.",
            ),
        ),
    )

    private fun get(path: String, token: String?): HttpResponse<InputStream> {
        val builder = HttpRequest.newBuilder(URI.create("${address.url}$path")).GET()
        token?.let { builder.header(BridgeServer.TOKEN_HEADER, it) }
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
    }

    private fun post(path: String, token: String?, body: String): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI.create("${address.url}$path"))
            .POST(HttpRequest.BodyPublishers.ofString(body))
        token?.let { builder.header(BridgeServer.TOKEN_HEADER, it) }
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun openStream(): HttpResponse<InputStream> {
        val response = get(BridgeServer.EVENTS_PATH, address.token)
        assertEquals(200, response.statusCode())
        waitFor { server.streamCount() >= 1 }
        return response
    }

    private fun waitFor(what: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5000
        while (!what()) {
            check(System.currentTimeMillis() < deadline) { "the condition never became true" }
            Thread.sleep(10)
        }
    }

    /** Reads the stream until the first data line arrives, so a broken server cannot hang the test. */
    private fun firstData(stream: InputStream): String =
        CompletableFuture.supplyAsync {
            stream.bufferedReader().lineSequence().first { it.startsWith("data:") }
        }.get(5, TimeUnit.SECONDS)

    @Test
    fun `listens on the loopback address only`() {
        assertTrue(address.url.startsWith("http://127.0.0.1:"), address.url)
        assertTrue(address.port > 0)
    }

    @Test
    fun `makes a token the channel accepts`() {
        assertTrue(address.token.length >= 16)
    }

    @Test
    fun `refuses the event stream without a token`() {
        assertEquals(401, get(BridgeServer.EVENTS_PATH, null).statusCode())
    }

    @Test
    fun `refuses the event stream with a wrong token`() {
        assertEquals(401, get(BridgeServer.EVENTS_PATH, "0".repeat(64)).statusCode())
    }

    @Test
    fun `opens the event stream for the right token`() {
        val response = openStream()
        assertEquals("text/event-stream", response.headers().firstValue("content-type").orElse(""))
    }

    @Test
    fun `sends a batch to the open stream`() {
        val response = openStream()
        assertEquals(1, server.send(batch))
        assertEquals("data: ${BatchJson.encode(batch)}", firstData(response.body()))
    }

    @Test
    fun `sends a batch to every open stream`() {
        val first = openStream()
        val second = get(BridgeServer.EVENTS_PATH, address.token)
        waitFor { server.streamCount() == 2 }
        assertEquals(2, server.send(batch))
        assertTrue(firstData(first.body()).contains(fullId))
        assertTrue(firstData(second.body()).contains(fullId))
    }

    @Test
    fun `reports that no session is connected`() {
        assertEquals(0, server.send(batch))
    }

    @Test
    fun `refuses the resolve request without a token`() {
        assertEquals(401, post(BridgeServer.RESOLVE_PATH, null, """{"ids":["$fullId"]}""").statusCode())
        assertEquals(emptyList(), reported)
    }

    @Test
    fun `refuses the resolve request with a wrong token`() {
        assertEquals(401, post(BridgeServer.RESOLVE_PATH, "0".repeat(64), """{"ids":["$fullId"]}""").statusCode())
        assertEquals(emptyList(), reported)
    }

    @Test
    fun `hands the ids of a good resolve request to the plugin`() {
        assertEquals(200, post(BridgeServer.RESOLVE_PATH, address.token, """{"ids":["$fullId"]}""").statusCode())
        assertEquals(listOf(listOf(fullId)), reported)
    }

    @Test
    fun `refuses an id that is not a comment id`() {
        val response = post(BridgeServer.RESOLVE_PATH, address.token, """{"ids":["--upload-pack=calc"]}""")
        assertEquals(400, response.statusCode())
        assertEquals(emptyList(), reported)
    }

    @Test
    fun `refuses a body that is too large`() {
        val body = """{"ids":["${"a".repeat(BridgeServer.MAX_BODY_BYTES - 11)}"]}"""
        assertEquals(BridgeServer.MAX_BODY_BYTES + 1, body.length)
        assertEquals(413, post(BridgeServer.RESOLVE_PATH, address.token, body).statusCode())
        assertEquals(emptyList(), reported)
    }

    @Test
    fun `gives the reason back when the plugin refuses the report`() {
        refusal = "No review comment has that id."
        val response = post(BridgeServer.RESOLVE_PATH, address.token, """{"ids":["$fullId"]}""")
        assertEquals(409, response.statusCode())
        assertTrue(response.body().contains("No review comment has that id."))
    }

    @Test
    fun `answers a path it does not serve`() {
        assertEquals(404, get("/comments", address.token).statusCode())
    }

    @Test
    fun `answers a method the path does not serve`() {
        assertEquals(405, post(BridgeServer.EVENTS_PATH, address.token, "{}").statusCode())
    }
}
