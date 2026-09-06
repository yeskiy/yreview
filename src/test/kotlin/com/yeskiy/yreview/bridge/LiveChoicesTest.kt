package com.yeskiy.yreview.bridge

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.session.SessionReach
import com.yeskiy.yreview.session.SessionRegistry
import com.yeskiy.yreview.settings.ReviewSettings
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Which sessions the send chooser offers.
 *
 * The reach of a session decides, and never the open stream set alone. An agent that takes
 * no push can register the tool server of its session, and that server then holds an open
 * stream. Such a session must stay out of the chooser.
 *
 * The bridge holds the open stream set inside the running server, and only a real request
 * puts a key into it. A test that needs an open stream therefore starts the server on an
 * ephemeral loopback port and reads the event path over HTTP.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class LiveChoicesTest : BasePlatformTestCase() {

    private lateinit var client: HttpClient

    /**
     * The fixture of the platform hands one light project to every test of the run, and
     * the registry is a service of that project. A session of an earlier test therefore
     * stays in the list. Both ends of this fixture clear the list, so no test reads a
     * session of another test.
     */
    override fun setUp() {
        super.setUp()
        ReviewSettings.getInstance(project).channel = true
        clearSessions()
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    }

    override fun tearDown() {
        try {
            client.shutdownNow()
            BridgeService.getInstance(project).stop()
            clearSessions()
        } finally {
            super.tearDown()
        }
    }

    private fun clearSessions() {
        val sessions = registry()
        sessions.entries().forEach { sessions.remove(it.key) }
    }

    private fun bridge(): BridgeService = BridgeService.getInstance(project)

    private fun registry(): SessionRegistry = SessionRegistry.getInstance(project)

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

    /**
     * Check 13 of the manual plan reads a Codex session and finds no row in the chooser.
     * A real machine confirmed the missing row, and it could not confirm the premise,
     * because Codex never started a channel server there. This test holds that premise.
     * The stream is open, the key is in the open stream set, and the session takes no send.
     */
    fun `test a session that takes no send is not offered while its stream is open`() {
        val address = bridge().start()!!
        registry().add(CODEX_KEY, "Codex 1", SessionReach.None)

        openStream(address, CODEX_KEY)

        assertEquals("the stream of the session must be open", 1, bridge().readerCount())
        assertEquals(
            "an open stream must not offer a session that takes no send",
            emptyList<SessionChoice>(),
            bridge().liveChoices(),
        )
    }

    fun `test a channel session is offered while its stream is open`() {
        val address = bridge().start()!!
        registry().add(CLAUDE_KEY, "Claude 1", SessionReach.Channel)

        openStream(address, CLAUDE_KEY)

        assertEquals(listOf(SessionChoice(CLAUDE_KEY, "Claude 1")), bridge().liveChoices())
    }

    fun `test a channel session is not offered while its stream is closed`() {
        bridge().start()!!
        registry().add(CLAUDE_KEY, "Claude 1", SessionReach.Channel)

        assertEquals(0, bridge().readerCount())
        assertEquals(
            "a channel session with no stream reaches nothing",
            emptyList<SessionChoice>(),
            bridge().liveChoices(),
        )
    }

    fun `test a session with a port of its own is offered while no stream is open`() {
        registry().add(OPENCODE_KEY, "OpenCode 1", SessionReach.LocalHttp(47821, "s3cret"))

        assertNull("the bridge must still be down, so the open stream set is empty", bridge().address)
        assertEquals(listOf(SessionChoice(OPENCODE_KEY, "OpenCode 1")), bridge().liveChoices())
    }

    /**
     * The filter keeps the order of the tabs, and it carries the key and the name of each
     * session it keeps. One open stream must not lift the two sessions beside it.
     */
    fun `test the chooser offers the sessions the reach allows in the order of the tabs`() {
        val address = bridge().start()!!
        registry().add(CODEX_KEY, "Codex 1", SessionReach.None)
        registry().add(OPENCODE_KEY, "OpenCode 1", SessionReach.LocalHttp(47821, "s3cret"))
        registry().add(CLAUDE_KEY, "Claude 1", SessionReach.Channel)
        registry().add(SECOND_CLAUDE_KEY, "Claude 2", SessionReach.Channel)

        openStream(address, CODEX_KEY)
        openStream(address, CLAUDE_KEY)

        assertEquals(2, bridge().readerCount())
        assertEquals(
            listOf(SessionChoice(OPENCODE_KEY, "OpenCode 1"), SessionChoice(CLAUDE_KEY, "Claude 1")),
            bridge().liveChoices(),
        )
    }

    private companion object {
        const val CODEX_KEY = "cccccccccccccccc"
        const val CLAUDE_KEY = "aaaaaaaaaaaaaaaa"
        const val SECOND_CLAUDE_KEY = "dddddddddddddddd"
        const val OPENCODE_KEY = "bbbbbbbbbbbbbbbb"
    }
}
