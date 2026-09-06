package com.yeskiy.yreview.bridge

import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.concurrent.Executors
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * An HTTP server that speaks version 1.1 alone, the way the OpenCode server does.
 *
 * A plain request gets 200. A request that asks the server to change to version 2 gets no
 * answer, and the connection stays open. A client that asks for the change therefore waits
 * to its deadline and reads a failure.
 */
private class PlainOnlyOpenCode {

    val paths: MutableList<String> = Collections.synchronizedList(mutableListOf())

    /** The path of every request that asked the server to change the version. */
    val upgrades: MutableList<String> = Collections.synchronizedList(mutableListOf())

    private val open = Collections.synchronizedList(mutableListOf<Socket>())

    private val listener = ServerSocket(0, BACKLOG, InetAddress.getByName("127.0.0.1"))

    private val pool = Executors.newCachedThreadPool { Thread(it, "plain-opencode").apply { isDaemon = true } }

    val port: Int get() = listener.localPort

    init {
        pool.execute {
            while (!listener.isClosed) {
                val socket = runCatching { listener.accept() }.getOrNull() ?: break
                open += socket
                pool.execute { serve(socket) }
            }
        }
    }

    fun stop() {
        listener.close()
        open.toList().forEach { runCatching { it.close() } }
        pool.shutdownNow()
    }

    private fun serve(socket: Socket) {
        val reader = socket.getInputStream().bufferedReader(StandardCharsets.UTF_8)
        val head = generateSequence { reader.readLine() }.takeWhile { it.isNotEmpty() }.toList()
        if (head.isEmpty()) return
        val path = head.first().substringAfter(' ').substringBefore(' ')
        paths += path
        if (head.any { it.startsWith("upgrade:", true) || it.startsWith("http2-settings:", true) }) {
            upgrades += path
            return
        }
        repeat(length(head)) { if (reader.read() < 0) return }
        socket.getOutputStream().apply {
            write(ANSWER.toByteArray(StandardCharsets.UTF_8))
            flush()
        }
        socket.close()
    }

    private fun length(head: List<String>): Int =
        head.firstOrNull { it.startsWith("content-length:", true) }?.substringAfter(':')?.trim()?.toIntOrNull() ?: 0

    companion object {

        private const val BACKLOG = 50

        private const val ANSWER = "HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\ntrue"
    }
}

class OpenCodeHttpVersionTest {

    private var server: PlainOnlyOpenCode? = null

    @AfterTest
    fun tearDown() {
        server?.stop()
        server = null
    }

    private fun start(): PlainOnlyOpenCode = PlainOnlyOpenCode().also { server = it }

    @Test
    fun `the client speaks http version 1 1`() {
        assertEquals(HttpClient.Version.HTTP_1_1, OpenCodeClient.client.version())
    }

    @Test
    fun `a push goes through against a server that speaks version 1 1 alone`() {
        val plain = start()

        val problem = OpenCodeClient.push(plain.port, "s3cret", "do the work")

        assertNull(problem)
        assertEquals(listOf(OpenCodeClient.APPEND_PATH, OpenCodeClient.SUBMIT_PATH), plain.paths.toList())
    }

    @Test
    fun `a push never asks the server to change the version`() {
        val plain = start()

        OpenCodeClient.push(plain.port, "s3cret", "do the work")

        assertEquals(emptyList(), plain.upgrades.toList())
    }
}
