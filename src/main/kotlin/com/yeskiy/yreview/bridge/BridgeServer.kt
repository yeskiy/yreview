package com.yeskiy.yreview.bridge

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import com.yeskiy.yreview.tasks.TaskLabels
import java.io.IOException
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import java.util.concurrent.atomic.AtomicBoolean

/** Where the bridge listens, and the secret a session must send to reach it. */
data class BridgeAddress(val url: String, val token: String, val port: Int)

/**
 * The two endpoints the channel talks to. The channel-server module holds the other side.
 *
 * The server holds no IDE class, so a test starts it on an ephemeral port and talks to it
 * with a plain HTTP client. The plugin passes the resolve work in through [onResolve],
 * which reads the identifiers and the key of the session that sent them. It returns null
 * after a good report, or the text of the problem.
 */
class BridgeServer(private val onResolve: (List<String>, String?) -> String?) {

    /**
     * One open event stream. [key] names the session, and null means a session with no key.
     *
     * [StreamQueue] holds the events of this stream, drops the ones beyond its bound, and
     * counts them for the line that names the loss.
     */
    private class Reader(val key: String?) {

        val queue = StreamQueue()
    }

    private val streams = CopyOnWriteArrayList<Reader>()

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
        streams.forEach { it.queue.replaceWith(STOP) }
        streams.clear()
        http?.stop(0)
        http = null
        pool?.shutdownNow()
        pool = null
        token = ""
    }

    /**
     * Writes the batch to the stream of [target], or to every open stream when [target] is
     * null. Returns the number of streams it reached, so a target that already left the
     * bridge gives zero and the caller can say so.
     *
     * A stream whose queue is full loses this batch and keeps the batches it already holds.
     * The count of the loss goes to that stream, and the reader of it then reads one line
     * that names the number.
     */
    fun send(batch: ReviewBatch, target: String? = null): Int {
        val data = BatchJson.encode(batch)
        val open = streams.toList().filter { target == null || it.key == target }
        open.forEach { it.queue.add(data) }
        return open.size
    }

    fun streamCount(): Int = streams.size

    /**
     * The keys of the sessions whose tool server reads the bridge right now. A stream with
     * no key is not here.
     *
     * An open stream proves that the tool server of the session is registered. It does not
     * prove that the session takes a send, because an agent can register the tool server
     * and still drop a pushed message. The caller answers that second question.
     */
    fun openKeys(): List<String> = streams.toList().mapNotNull { it.key }.distinct()

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
            is ResolveParse.Ids -> report(exchange, parsed.ids, sessionOf(exchange))
        }
    }

    /**
     * Hands the ids to the plugin, together with the session that reported them. A failure
     * keeps the comments open on the channel side, so the model reads the reason and can
     * try again.
     */
    private fun report(exchange: HttpExchange, ids: List<String>, session: String?) {
        val failure = try {
            onResolve(ids, session)
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
        val reader = Reader(sessionOf(exchange))
        streams.add(reader)
        try {
            exchange.responseHeaders.set("Content-Type", "text/event-stream")
            exchange.responseHeaders.set("Cache-Control", "no-store")
            exchange.sendResponseHeaders(200, 0)
            val body = exchange.responseBody
            write(body, ": open\n\n")
            while (running.get()) {
                val next = reader.queue.next(KEEPALIVE_SECONDS)
                reportLoss(body, reader)
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
            streams.remove(reader)
        }
    }

    // --- The helpers ---

    /** Names the events one stream lost. A stream that lost nothing gets no line. */
    private fun reportLoss(body: OutputStream, reader: Reader) {
        val lost = reader.queue.takeLoss()
        if (lost == 0) return
        write(body, lossLine(lost))
    }

    private fun authorized(exchange: HttpExchange): Boolean =
        BridgeToken.matches(token, exchange.requestHeaders.getFirst(TOKEN_HEADER))

    /** A header that the plugin did not write names no session, so the reader stays unkeyed. */
    private fun sessionOf(exchange: HttpExchange): String? =
        exchange.requestHeaders.getFirst(SessionKey.HEADER).takeIf { SessionKey.isValid(it) }

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

        /** The number of event streams the bridge serves at once. The window reads it too. */
        const val MAX_STREAMS = 16

        /** The start of the line that names the events one stream lost. */
        const val DROPPED = "the bridge dropped"

        /**
         * The whole line that names the events one stream lost.
         *
         * The line is a Server-Sent Events comment. It can never look like a batch, so a
         * client that reads the events keeps its contract, and a person who reads the raw
         * stream sees how many events went.
         */
        internal fun lossLine(lost: Int): String =
            ": $DROPPED ${TaskLabels.count(lost, "event")} for this session, because it read none\n\n"

        private const val LOOPBACK = "127.0.0.1"
        private const val EPHEMERAL_PORT = 0
        private const val BACKLOG = 16
        private const val KEEPALIVE_SECONDS = 20L
        private const val STOP = ""
    }
}
