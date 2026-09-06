package com.yeskiy.yreview.bridge

import java.net.Socket
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * What one event stream tells its client about the events it lost.
 *
 * The thread of a stream stands inside its write for as long as the client takes no byte.
 * Nothing leaves the queue of that stream then, so every send adds one more event to it.
 * The queue holds a bound, and the events beyond that bound go away. The stream then
 * writes one line that names the number.
 *
 * [StreamQueueTest] proves the bound itself, because a socket blocks its writer only after
 * the buffers of the operating system are full, and the size of those buffers belongs to
 * the platform. The tests here read the line of the loss, and one real stream proves that
 * a client which loses nothing reads no such line.
 */
class BridgeQueueTest {

    private val server = BridgeServer { _, _ -> null }

    private val address = server.start()

    private var socket: Socket? = null

    @AfterTest
    fun tearDown() {
        socket?.close()
        server.stop()
    }

    @Test
    fun `the line of a loss names the number of events`() {
        val line = BridgeServer.lossLine(LOST)

        assertTrue(line.startsWith(": ${BridgeServer.DROPPED} $LOST events"), line)
        assertTrue(line.endsWith("\n\n"), "a comment of an event stream ends with a blank line")
    }

    @Test
    fun `the line of one lost event names one event`() {
        assertTrue(
            BridgeServer.lossLine(1).startsWith(": ${BridgeServer.DROPPED} 1 event "),
            BridgeServer.lossLine(1),
        )
    }

    @Test
    fun `a stream whose client reads keeps every event`() {
        val open = openStream()

        server.send(batch(0))

        assertTrue(!read(open).contains(BridgeServer.DROPPED), "a stream that loses nothing must name no loss")
    }

    /** A socket that asks for the events and then reads nothing until the test reads. */
    private fun openStream(): Socket {
        val open = Socket(LOOPBACK, address.port)
        socket = open
        open.soTimeout = READ_TIMEOUT_MILLIS
        val request = "GET ${BridgeServer.EVENTS_PATH} HTTP/1.1\r\n" +
            "Host: $LOOPBACK:${address.port}\r\n" +
            "${BridgeServer.TOKEN_HEADER}: ${address.token}\r\n" +
            "Accept: text/event-stream\r\n" +
            "\r\n"
        open.getOutputStream().write(request.toByteArray(StandardCharsets.UTF_8))
        open.getOutputStream().flush()
        waitFor { server.streamCount() == 1 }
        return open
    }

    /** Reads the stream until the line about the loss arrives, or until the reads stop. */
    private fun read(open: Socket): String {
        val body = StringBuilder()
        val chunk = ByteArray(CHUNK_BYTES)
        val deadline = System.currentTimeMillis() + WAIT_MILLIS
        while (System.currentTimeMillis() < deadline && body.length < MAX_CHARS) {
            val count = try {
                open.getInputStream().read(chunk)
            } catch (silent: SocketTimeoutException) {
                break
            }
            if (count < 0) break
            body.append(String(chunk, 0, count, StandardCharsets.UTF_8))
            if (body.contains(BridgeServer.DROPPED)) break
        }
        return body.toString()
    }

    private fun waitFor(what: () -> Boolean) {
        val deadline = System.currentTimeMillis() + WAIT_MILLIS
        while (!what()) {
            check(System.currentTimeMillis() < deadline) { "the condition never became true" }
            Thread.sleep(STEP_MILLIS)
        }
    }

    /** One batch with a text of [TEXT_CHARS] characters, the size of a long comment. */
    private fun batch(number: Int) = ReviewBatch(
        batchId = "b$number",
        branch = "main",
        commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
        comments = listOf(
            BatchComment(
                id = "c$number",
                path = "src/main/kotlin/Parser.kt",
                startLine = 1,
                endLine = 1,
                revision = "HEAD",
                text = "x".repeat(TEXT_CHARS),
            ),
        ),
    )

    private companion object {
        const val LOOPBACK = "127.0.0.1"

        /** More than one lost event, so the line must name a plural. */
        const val LOST = 5

        const val TEXT_CHARS = 20_000
        const val CHUNK_BYTES = 65_536
        const val MAX_CHARS = 2_000_000
        const val WAIT_MILLIS = 15_000L
        const val READ_TIMEOUT_MILLIS = 2_000
        const val STEP_MILLIS = 10L
    }
}
