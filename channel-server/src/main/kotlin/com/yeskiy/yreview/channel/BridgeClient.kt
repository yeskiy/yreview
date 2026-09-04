package com.yeskiy.yreview.channel

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

@Serializable
private data class ResolveBody(val ids: List<String>)

/** The whole events of one read, and the part of the buffer that is still incomplete. */
data class Drained(val events: List<String>, val rest: String)

/**
 * Holds one open connection to the bridge of the IDE.
 *
 * The bridge writes Server-Sent Events, and each event carries one batch of comments. A
 * closed stream opens again after a short wait, because the IDE restarts the bridge with
 * the project. The token travels in a header, and it never reaches a log or a command line.
 */
class BridgeClient(
    private val bridgeUrl: String,
    private val token: String,
    private val sessionKey: String? = null,
    private val onError: (Throwable) -> Unit,
    private val retryDelayMs: Long = DEFAULT_RETRY_DELAY_MS,
) {

    private val running = AtomicBoolean(false)

    private val open = AtomicReference<InputStream?>(null)

    private val onBatch = AtomicReference<(suspend (ReviewBatch) -> Unit)?>(null)

    private var reader: Job? = null

    private val http: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(CONNECT_TIMEOUT_SECONDS))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()

    fun start(scope: CoroutineScope, handler: suspend (ReviewBatch) -> Unit) {
        if (!running.compareAndSet(false, true)) return
        onBatch.set(handler)
        reader = scope.launch { loop() }
    }

    suspend fun stop() {
        running.set(false)
        runCatching { open.getAndSet(null)?.close() }
        reader?.cancel()
        reader = null
    }

    /** Reports the fixed comments to the IDE. A refusal keeps the comments open. */
    suspend fun resolve(ids: List<String>) {
        val request = HttpRequest.newBuilder(URI.create("$bridgeUrl$RESOLVE_PATH"))
            .header("content-type", "application/json")
            .header(TOKEN_HEADER, token)
            .apply { sessionKey?.let { header(SESSION_HEADER, it) } }
            .POST(HttpRequest.BodyPublishers.ofString(Json.encodeToString(ResolveBody(ids))))
            .build()
        val status = withContext(Dispatchers.IO) {
            try {
                http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()
            } catch (broken: IOException) {
                throw IOException(silent(broken))
            }
        }
        if (status !in OK_RANGE) throw IOException("the bridge refused the report with status $status")
    }

    /** A readable reason that names the address only. The token never reaches a message. */
    private fun silent(cause: IOException): String =
        "the bridge did not answer at $bridgeUrl (${cause.message ?: cause.javaClass.simpleName})"

    // --- The event stream ---

    private suspend fun loop() {
        while (running.get()) {
            try {
                openStream()
            } catch (stopped: CancellationException) {
                throw stopped
            } catch (cause: Throwable) {
                if (running.get()) onError(cause)
            }
            if (running.get()) delay(retryDelayMs)
        }
    }

    private suspend fun openStream() {
        val request = HttpRequest.newBuilder(URI.create("$bridgeUrl$EVENTS_PATH"))
            .header("accept", "text/event-stream")
            .header(TOKEN_HEADER, token)
            .apply { sessionKey?.let { header(SESSION_HEADER, it) } }
            .GET()
            .build()
        val response = withContext(Dispatchers.IO) {
            try {
                http.send(request, HttpResponse.BodyHandlers.ofInputStream())
            } catch (broken: IOException) {
                throw IOException(silent(broken))
            }
        }
        if (response.statusCode() !in OK_RANGE) {
            runCatching { response.body().close() }
            throw IOException("the bridge refused the event stream with status ${response.statusCode()}")
        }
        open.set(response.body())
        try {
            read(response.body())
        } finally {
            runCatching { open.getAndSet(null)?.close() }
        }
    }

    /**
     * Reads the stream until it ends. The reader keeps the part of a message that is still
     * incomplete, because one read gives any number of bytes.
     */
    private suspend fun read(body: InputStream) {
        val source = InputStreamReader(body, StandardCharsets.UTF_8)
        val chunk = CharArray(READ_SIZE)
        val carry = StringBuilder()
        while (running.get()) {
            val count = withContext(Dispatchers.IO) {
                try {
                    source.read(chunk)
                } catch (broken: IOException) {
                    if (running.get()) onError(broken)
                    -1
                }
            }
            if (count < 0) return
            if (carry.length + count > MAX_EVENT_CHARS) {
                carry.setLength(0)
                onError(IOException("the bridge sent an event that is too large, so it was dropped"))
                continue
            }
            carry.appendRange(chunk, 0, count)
            val drained = drainEvents(carry.toString())
            carry.setLength(0)
            carry.append(drained.rest)
            drained.events.forEach { handle(it) }
        }
    }

    private suspend fun handle(data: String) {
        val parsed = runCatching { Json.parseToJsonElement(data) }
        if (parsed.isFailure) {
            val reason = parsed.exceptionOrNull()?.message ?: "the value is not JSON"
            onError(IOException("the bridge sent an event that is not JSON: $reason"))
            return
        }
        when (val batch = BatchSchema.parse(data)) {
            is BatchParse.Bad ->
                onError(IOException("the bridge sent a batch that does not match the contract: ${batch.reason}"))

            is BatchParse.Ok -> runCatching { onBatch.get()?.invoke(batch.batch) }
                .onFailure { if (it is CancellationException) throw it else onError(it) }
        }
    }

    companion object {

        const val TOKEN_HEADER = "x-y-review-token"

        /** The address of this session. The bridge sends a batch to one session by it. */
        const val SESSION_HEADER = "X-Y-Review-Session"

        const val EVENTS_PATH = "/events"

        const val RESOLVE_PATH = "/resolve"

        const val DEFAULT_RETRY_DELAY_MS = 1000L

        const val MAX_EVENT_CHARS = 4_000_000

        private const val CONNECT_TIMEOUT_SECONDS = 10L

        private const val READ_SIZE = 8192

        private val OK_RANGE = 200..299

        /**
         * Takes whole Server-Sent Events out of the buffer and returns the incomplete rest.
         *
         * A blank line ends one event. Every line that starts with data belongs to the body,
         * and one space after the colon is part of the frame and not of the value.
         */
        fun drainEvents(buffer: String): Drained {
            val blocks = buffer.replace("\r\n", "\n").split("\n\n")
            return Drained(
                events = blocks.dropLast(1)
                    .map { block ->
                        block.split("\n")
                            .filter { it.startsWith("data:") }
                            .joinToString("\n") { it.removePrefix("data:").removePrefix(" ") }
                    }
                    .filter { it.isNotEmpty() },
                rest = blocks.last(),
            )
        }
    }
}
