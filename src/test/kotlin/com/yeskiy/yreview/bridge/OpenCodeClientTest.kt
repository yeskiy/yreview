package com.yeskiy.yreview.bridge

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.Collections
import java.util.concurrent.Executors
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The HTTP server of one OpenCode session, small enough for a test. */
private class FakeOpenCode(private val status: Int = 200) {

    val paths: MutableList<String> = Collections.synchronizedList(mutableListOf())
    val bodies: MutableList<String> = Collections.synchronizedList(mutableListOf())
    val authorizations: MutableList<String> = Collections.synchronizedList(mutableListOf())

    private val pool = Executors.newCachedThreadPool { Thread(it, "fake-opencode").apply { isDaemon = true } }

    private val http: HttpServer =
        HttpServer.create(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0).apply {
            createContext("/tui/") { record(it) }
            executor = pool
            start()
        }

    val port: Int get() = http.address.port

    private fun record(exchange: HttpExchange) {
        paths += exchange.requestURI.toString()
        authorizations += exchange.requestHeaders.getFirst("Authorization").orEmpty()
        bodies += exchange.requestBody.readBytes().toString(StandardCharsets.UTF_8)
        val answer = "true".toByteArray(StandardCharsets.UTF_8)
        exchange.sendResponseHeaders(status, answer.size.toLong())
        exchange.responseBody.use { it.write(answer) }
    }

    fun stop() {
        http.stop(0)
        pool.shutdownNow()
    }
}

class OpenCodeClientTest {

    private var fake: FakeOpenCode? = null

    @AfterTest
    fun tearDown() {
        fake?.stop()
        fake = null
    }

    private fun start(status: Int = 200): FakeOpenCode = FakeOpenCode(status).also { fake = it }

    /** The port of a server that stopped, so nothing listens on it any more. */
    private fun deadPort(): Int {
        val server = start()
        val port = server.port
        server.stop()
        fake = null
        return port
    }

    @Test
    fun `the body carries the text as json`() {
        val body = OpenCodeClient.appendBody("line one\nline two `x` \"y\"")

        assertEquals(
            "line one\nline two `x` \"y\"",
            Json.parseToJsonElement(body).jsonObject["text"]!!.jsonPrimitive.content,
        )
    }

    @Test
    fun `the header carries the fixed user name and the password`() {
        val header = OpenCodeClient.authorization("s3cret")

        assertTrue(header.startsWith("Basic "), header)
        assertEquals(
            "opencode:s3cret",
            String(Base64.getDecoder().decode(header.removePrefix("Basic ")), StandardCharsets.UTF_8),
        )
    }

    @Test
    fun `a push calls append and then submit`() {
        val server = start()

        val problem = OpenCodeClient.push(server.port, "s3cret", "do the work")

        assertNull(problem)
        assertEquals(listOf(OpenCodeClient.APPEND_PATH, OpenCodeClient.SUBMIT_PATH), server.paths.toList())
    }

    @Test
    fun `a push sends no directory parameter`() {
        // Each session owns its port, and a wrong directory would drop the text with a 200.
        val server = start()

        OpenCodeClient.push(server.port, "s3cret", "do the work")

        assertTrue(server.paths.none { it.contains("directory") }, server.paths.toString())
    }

    @Test
    fun `a push never clears the input box`() {
        // Text the user already typed stays, because a clear could not be undone.
        val server = start()

        OpenCodeClient.push(server.port, "s3cret", "do the work")

        assertTrue(server.paths.none { it.contains("clear") }, server.paths.toString())
    }

    @Test
    fun `a push carries the text and the credentials on the first call`() {
        val server = start()

        OpenCodeClient.push(server.port, "s3cret", "do the work")

        assertEquals(
            "do the work",
            Json.parseToJsonElement(server.bodies.first()).jsonObject["text"]!!.jsonPrimitive.content,
        )
        assertEquals(OpenCodeClient.authorization("s3cret"), server.authorizations.first())
    }

    @Test
    fun `a refused call reports the status and calls nothing more`() {
        val server = start(status = 401)

        val problem = assertNotNull(OpenCodeClient.push(server.port, "wrong", "do the work"))

        assertTrue(problem.contains("401"), problem)
        assertEquals(listOf(OpenCodeClient.APPEND_PATH), server.paths.toList())
    }

    @Test
    fun `a refused call never holds the password`() {
        val server = start(status = 401)

        val problem = assertNotNull(OpenCodeClient.push(server.port, "the-secret-value", "do the work"))

        assertTrue(!problem.contains("the-secret-value"), problem)
    }

    @Test
    fun `a port that nothing listens on reports a problem`() {
        val problem = assertNotNull(OpenCodeClient.push(deadPort(), "s3cret", "do the work"))

        assertTrue(problem.isNotEmpty(), problem)
    }

    @Test
    fun `a problem never holds the password`() {
        val problem = assertNotNull(OpenCodeClient.push(deadPort(), "the-secret-value", "do the work"))

        assertTrue(!problem.contains("the-secret-value"), problem)
    }
}
