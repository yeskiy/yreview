package com.yeskiy.yreview.diagnostic

import com.yeskiy.yreview.bridge.SendReport
import com.yeskiy.yreview.bridge.SendRoute
import com.yeskiy.yreview.session.BridgeLookup
import com.yeskiy.yreview.session.ChannelServer
import com.yeskiy.yreview.session.SessionPlan
import com.yeskiy.yreview.store.StoreKind
import java.io.IOException
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The record of one session start, one send and one failure.
 *
 * Every value of these tests is explicit, so no default reads the machine that runs the
 * test.
 */
class SessionRecordTest {

    private val project = "E:/work/demo-repo"

    private val token = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0"

    private val server = ChannelServer.Answer.Found("C:/Users/alice/plugins/y-review/channel/y-review-channel.jar")

    private val javaPath = "C:/Users/alice/idea/jbr/bin/java.exe"

    private val configFile = "C:/Users/alice/AppData/Local/Temp/claude-y-review-mcp-1.json"

    private val at = LocalDateTime.of(2026, 9, 4, 10, 11, 12)

    private val ready = BridgeLookup.Available("http://127.0.0.1:64343", token)

    private fun session(bridge: BridgeLookup) = SessionRecord.Session.of(
        plan = SessionPlan.of(project, bridge, "claude", server, javaPath, configFile),
        server = server,
        javaPath = javaPath,
        configFile = configFile,
        terminalStarted = true,
        processId = 4242,
        now = at,
    )

    @Test
    fun `the session record never carries the bridge token`() {
        assertFalse(session(ready).text().contains(token), "the token guards the port and must stay off a report")
    }

    @Test
    fun `the session record carries the bridge address`() {
        assertTrue(session(ready).text().contains("http://127.0.0.1:64343"), "a maintainer needs the port")
    }

    @Test
    fun `the session record carries the time and the process`() {
        val text = session(ready).text()

        assertTrue(text.startsWith("[2026-09-04 10:11:12] session start"), text)
        assertTrue(text.contains("4242"), text)
    }

    @Test
    fun `the session record carries the reason the channel stayed out`() {
        val off = session(BridgeLookup.ChannelOff)

        assertTrue(off.status.contains("off in the settings"), "the reason answers the first question")
        assertEquals(false, off.bridgeReady)
    }

    @Test
    fun `the session record names the channel server and the java runtime`() {
        val text = session(ready).text()

        assertTrue(text.contains("found at "), text)
        assertTrue(text.contains("y-review-channel.jar"), text)
        assertTrue(text.contains("java.exe"), text)
    }

    @Test
    fun `the send record carries the route the store and the readers`() {
        val text = SessionRecord.Send.of(
            report = SendReport(tasks = 3, batches = 1, streams = 1, route = SendRoute.CHANNEL),
            store = StoreKind.GIT,
            readers = 1,
            now = at,
        ).text()

        assertTrue(text.contains("channel"), text)
        assertTrue(text.contains("git"), text)
        assertTrue(text.contains("readers"), text)
    }

    @Test
    fun `the send record carries the reason a send took the clipboard`() {
        val text = SessionRecord.Send.of(
            report = SendReport(tasks = 2, batches = 0, streams = 0, route = SendRoute.NO_SESSION),
            store = StoreKind.FOLDER,
            readers = 0,
            now = at,
        ).text()

        assertTrue(text.contains("no_session"), text)
        assertTrue(text.contains("folder"), text)
    }

    @Test
    fun `the failure record names the work the type and the frame of the plugin`() {
        val text = SessionRecord.Failure.of("write the task files", IOException("the disk is full"), at).text()

        assertTrue(text.contains("write the task files"), text)
        assertTrue(text.contains("java.io.IOException"), text)
        assertTrue(text.contains("the disk is full"), text)
        assertTrue(text.contains("com.yeskiy.yreview.diagnostic.SessionRecordTest"), text)
    }
}
