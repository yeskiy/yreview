package com.yeskiy.yreview.bridge

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.IOException
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Where the bridge listens, and the secret a session must send to reach it. */
data class BridgeAddress(val url: String, val token: String, val port: Int)

/**
 * The two endpoints the channel talks to. See channel/README.md for the contract.
 *
 * The server holds no IDE class, so a test starts it on an ephemeral port and talks to it
 * with a plain HTTP client. The plugin passes the resolve work in through [onResolve],
 * which returns null after a good report, or the text of the problem.
 */
class BridgeServer(private val onResolve: (List<String>) -> String?) {

    private val streams = CopyOnWriteArrayList<LinkedBlockingQueue<String>>()

    private val running = AtomicBoolean(false)

    private var http: HttpServer? = null

    private var pool: ExecutorService? = null

    @Volatile
    private var token: String = ""

    fun start(): BridgeAddress {
        check(http == null) { "the bridge server already runs" }
        val server = HttpServer.create(InetSocketAddress(InetAddress.getByName(LOOPBACK), EPHEMERAL_PORT), BACKLOG)
        val workers = Executors.newCachedThreadPool(daemonThreads())
        token = BridgeToken.newToken()
        server.createContext(EVENTS_PATH, ::handleEvents)
        server.createContext(RESOLVE_PATH, ::handleResolve)
        server.createContext("/") { exchange -> exchange.use { answer(exchange, 404, "This path is not part of the bridge.") } }
        server.executor = workers
        running.set(true)
        server.start()
        http = server
        pool = workers
        return BridgeAddress("http://$LOOPBACK:${server.address.port}", token, server.address.port)
    }

    fun stop() {
        running.set(false)
        streams.forEach { it.offer(STOP) }
        streams.clear()
        http?.stop(0)
        http = null
        pool?.shutdownNow()
        pool = null
        token = ""
    }

    /** Writes the batch to every open stream and returns the number of streams it reached. */
    fun send(batch: ReviewBatch): Int {
        val data = BatchJson.encode(batch)
        val open = streams.toList()
        open.forEach { it.offer(data) }
        return open.size
    }

    fun streamCount(): Int = streams.size

    // --- The endpoints ---

    private fun handleEvents(exchange: HttpExchange) {
        exchange.use {
            when {
                exchange.requestURI.path != EVENTS_PATH -> answer(exchange, 404, "This path is not part of the bridge.")
                !authorized(exchange) -> answer(exchange, 401, "The token does not match.")
                exchange.requestMethod != "GET" -> answer(exchange, 405, "This path answers GET only.")
                streams.size >= MAX_STREAMS -> answer(exchange, 503, "Too many sessions read this bridge.")
                else -> stream(exchange)
            }
        }
    }

    private fun handleResolve(exchange: HttpExchange) {
        exchange.use {
            when {
                exchange.requestURI.path != RESOLVE_PATH -> answer(exchange, 404, "This path is not part of the bridge.")
                !authorized(exchange) -> answer(exchange, 401, "The token does not match.")
                exchange.requestMethod != "POST" -> answer(exchange, 405, "This path answers POST only.")
                else -> resolve(exchange)
            }
        }
    }

    private fun resolve(exchange: HttpExchange) {
        val body = try {
            exchange.requestBody.readNBytes(MAX_BODY_BYTES + 1)
        } catch (broken: IOException) {
            return answer(exchange, 400, "The plugin could not read the body.")
        }
        if (body.size > MAX_BODY_BYTES) return answer(exchange, 413, "The body is too large.")

        when (val parsed = ResolveRequest.parse(String(body, StandardCharsets.UTF_8))) {
            is ResolveParse.Bad -> answer(exchange, 400, parsed.reason)
            is ResolveParse.Ids -> report(exchange, parsed.ids)
        }
    }

    /**
     * Hands the ids to the plugin. A failure keeps the comments open on the channel side,
     * so the model reads the reason and can try again.
     */
    private fun report(exchange: HttpExchange, ids: List<String>) {
        val failure = try {
            onResolve(ids)
        } catch (refused: RuntimeException) {
            return answer(exchange, 500, refused.message ?: "The plugin could not write the resolution.")
        }
        if (failure == null) answer(exchange, 200, "ok") else answer(exchange, 409, failure)
    }

    /**
     * Holds one Server-Sent Events connection open. The thread waits on the queue, so a
     * batch reaches the session at once, and the keep-alive line finds a dead connection.
     */
    private fun stream(exchange: HttpExchange) {
        val queue = LinkedBlockingQueue<String>()
        streams.add(queue)
        try {
            exchange.responseHeaders.set("Content-Type", "text/event-stream")
            exchange.responseHeaders.set("Cache-Control", "no-store")
            exchange.sendResponseHeaders(200, 0)
            val body = exchange.responseBody
            write(body, ": open\n\n")
            while (running.get()) {
                val next = queue.poll(KEEPALIVE_SECONDS, TimeUnit.SECONDS)
                when {
                    next == null -> write(body, ": keep-alive\n\n")
                    next == STOP -> return
                    else -> write(body, "data: $next\n\n")
                }
            }
        } catch (gone: IOException) {
            return
        } catch (stopped: InterruptedException) {
            Thread.currentThread().interrupt()
        } finally {
            streams.remove(queue)
        }
    }

    // --- The helpers ---

    private fun authorized(exchange: HttpExchange): Boolean =
        BridgeToken.matches(token, exchange.requestHeaders.getFirst(TOKEN_HEADER))

    private fun answer(exchange: HttpExchange, status: Int, text: String) {
        val bytes = text.toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.set("Content-Type", "text/plain; charset=utf-8")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun write(body: OutputStream, text: String) {
        body.write(text.toByteArray(StandardCharsets.UTF_8))
        body.flush()
    }

    private fun daemonThreads(): ThreadFactory = ThreadFactory { work ->
        Thread(work, "y-review-bridge").apply { isDaemon = true }
    }

    companion object {
        const val TOKEN_HEADER = "X-Y-Review-Token"
        const val EVENTS_PATH = "/events"
        const val RESOLVE_PATH = "/resolve"
        const val MAX_BODY_BYTES = 1_000_000

        private const val LOOPBACK = "127.0.0.1"
        private const val EPHEMERAL_PORT = 0
        private const val BACKLOG = 16
        private const val MAX_STREAMS = 16
        private const val KEEPALIVE_SECONDS = 20L
        private const val STOP = ""
    }
}
