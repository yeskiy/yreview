package com.yeskiy.yreview.bridge

import java.net.Socket
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * What one event stream does when its client reads nothing.
 *
 * The thread of a stream stands inside its write for as long as the client takes no byte.
 * Nothing leaves the queue of that stream then, so every send adds one more event to it.
 * The queue holds a bound, and the events beyond that bound go away.
 *
 * The client of this test is a plain socket that sends the request and reads nothing. The
 * test then reads the stream and looks for the line that names the loss.
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
    fun `a stream whose client reads nothing loses the events beyond the bound`() {
        val open = openStream()

        repeat(SENDS) { number -> server.send(batch(number)) }

        assertTrue(
            read(open).contains(BridgeServer.DROPPED),
            "the stream must name the events it lost",
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

    /** One batch that is large enough to fill the buffers of a socket in a few sends. */
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

        /** Enough sends to fill the buffers of the socket and the whole queue after them. */
        const val SENDS = 300

        const val TEXT_CHARS = 20_000
        const val CHUNK_BYTES = 65_536
        const val MAX_CHARS = 2_000_000
        const val WAIT_MILLIS = 15_000L
        const val READ_TIMEOUT_MILLIS = 2_000
        const val STEP_MILLIS = 10L
    }
}
