package com.yeskiy.yreview.channel

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.concurrent.Executors

/**
 * The bridge of the IDE, small enough for a test.
 *
 * The server answers the two paths of the contract, keeps every open event stream, and
 * records the token of each request. A test pushes a batch and reads what the channel did.
 */
class FakeBridge(fixedToken: String? = null) {

    val token: String = fixedToken ?: "a-token-of-32-characters-000000000"

    private val streams = Collections.synchronizedList(mutableListOf<HttpExchange>())

    val resolved: MutableList<List<String>> = Collections.synchronizedList(mutableListOf())

    val streamTokens: MutableList<String> = Collections.synchronizedList(mutableListOf())

    val resolveTokens: MutableList<String> = Collections.synchronizedList(mutableListOf())

    val streamKeys: MutableList<String> = Collections.synchronizedList(mutableListOf())

    val resolveKeys: MutableList<String> = Collections.synchronizedList(mutableListOf())

    private val pool = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "fake-bridge").apply { isDaemon = true }
    }

    private val http: HttpServer =
        HttpServer.create(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0).apply {
            createContext("/events", ::events)
            createContext("/resolve", ::resolve)
            createContext("/") { exchange -> answer(exchange, 404, "unknown path") }
            executor = pool
            start()
        }

    val url: String = "http://127.0.0.1:${http.address.port}"

    fun streamCount(): Int = streams.size

    fun push(batch: ReviewBatch) = pushRaw(Json.encodeToString(batch))

    /** Writes one Server-Sent Event. A line break inside the value opens a new data line. */
    fun pushRaw(data: String) {
        val frame = "data: ${data.replace("\n", "\ndata: ")}\n\n".toByteArray(StandardCharsets.UTF_8)
        streams.toList().forEach { exchange ->
            runCatching {
                exchange.responseBody.write(frame)
                exchange.responseBody.flush()
            }
        }
    }

    fun dropStreams() {
        streams.toList().forEach { runCatching { it.close() } }
        streams.clear()
    }

    fun waitForStream() = waitFor("the event stream") { streams.isNotEmpty() }

    fun close() {
        dropStreams()
        http.stop(0)
        pool.shutdownNow()
    }

    private fun events(exchange: HttpExchange) {
        streamTokens.add(exchange.requestHeaders.getFirst(BridgeClient.TOKEN_HEADER).orEmpty())
        streamKeys.add(exchange.requestHeaders.getFirst(BridgeClient.SESSION_HEADER).orEmpty())
        if (exchange.requestHeaders.getFirst(BridgeClient.TOKEN_HEADER) != token) {
            return answer(exchange, 401, "the token does not match")
        }
        exchange.responseHeaders.add("content-type", "text/event-stream")
        exchange.sendResponseHeaders(200, 0)
        exchange.responseBody.write(": open\n\n".toByteArray(StandardCharsets.UTF_8))
        exchange.responseBody.flush()
        streams.add(exchange)
    }

    private fun resolve(exchange: HttpExchange) {
        exchange.use {
            resolveTokens.add(exchange.requestHeaders.getFirst(BridgeClient.TOKEN_HEADER).orEmpty())
            resolveKeys.add(exchange.requestHeaders.getFirst(BridgeClient.SESSION_HEADER).orEmpty())
            if (exchange.requestHeaders.getFirst(BridgeClient.TOKEN_HEADER) != token) {
                return answer(exchange, 401, "the token does not match")
            }
            val body = String(exchange.requestBody.readAllBytes(), StandardCharsets.UTF_8)
            val ids = runCatching {
                (Json.parseToJsonElement(body) as kotlinx.serialization.json.JsonObject)["ids"] as JsonArray
            }.getOrNull() ?: return answer(exchange, 400, "the body must hold an ids array of strings")
            resolved.add(ids.map { (it as JsonPrimitive).content })
            answer(exchange, 200, "ok")
        }
    }

    private fun answer(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.add("content-type", "text/plain; charset=utf-8")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { stream: OutputStream -> stream.write(bytes) }
    }

    companion object {

        private const val DEADLINE_MS = 10_000L

        /** Waits until the check answers true. A test that waits forever helps nobody. */
        fun waitFor(what: String, ready: () -> Boolean) {
            val deadline = System.currentTimeMillis() + DEADLINE_MS
            while (!ready()) {
                check(System.currentTimeMillis() < deadline) { "gave up waiting for $what" }
                Thread.sleep(10)
            }
        }
    }
}
