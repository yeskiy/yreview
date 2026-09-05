package com.yeskiy.yreview.bridge

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.session.SessionReach
import com.yeskiy.yreview.session.SessionRegistry
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Who counts as a receiver of a review send.
 *
 * A session that the plugin started carries the flag that opens a channel, and the window
 * knows it by its key. A job that the agent started by itself inherits the tool server and
 * the bridge address, so it opens a stream of its own. Such a job drops a pushed message
 * in silence, and it must never count.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class ReceiverCountTest : BasePlatformTestCase() {

    private lateinit var client: HttpClient

    override fun setUp() {
        super.setUp()
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    }

    override fun tearDown() {
        try {
            client.shutdownNow()
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    private fun bridge(): BridgeService = BridgeService.getInstance(project)

    /** Opens one event stream for [key], and waits until the server holds it. */
    private fun openStream(address: BridgeAddress, key: String): HttpResponse<InputStream> {
        val before = bridge().readerCount()
        val request = HttpRequest.newBuilder(URI.create("${address.url}${BridgeServer.EVENTS_PATH}"))
            .GET()
            .header(BridgeServer.TOKEN_HEADER, address.token)
            .header(SessionKey.HEADER, key)
            .build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
        assertEquals(200, response.statusCode())
        val deadline = System.currentTimeMillis() + 5000
        while (bridge().readerCount() <= before) {
            check(System.currentTimeMillis() < deadline) { "the bridge never held the new stream" }
            Thread.sleep(10)
        }
        return response
    }

    fun `test a session of this window counts as a receiver`() {
        val address = bridge().start()!!
        SessionRegistry.getInstance(project).add(TAB_KEY, "Claude 1", SessionReach.Channel)

        openStream(address, TAB_KEY)

        assertEquals(1, bridge().receiverCount())
    }

    fun `test a stream that no tab of this window opened counts as no receiver`() {
        val address = bridge().start()!!
        SessionRegistry.getInstance(project).add(TAB_KEY, "Claude 1", SessionReach.Channel)
        openStream(address, TAB_KEY)

        openStream(address, JOB_KEY)

        assertEquals(2, bridge().readerCount())
        assertEquals(1, bridge().receiverCount())
    }

    private companion object {
        const val TAB_KEY = "aaaaaaaaaaaaaaaa"
        const val JOB_KEY = "bbbbbbbbbbbbbbbb"
    }
}
