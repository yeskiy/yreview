package com.yeskiy.yreview.diagnostic

import com.yeskiy.yreview.bridge.SendReport
import com.yeskiy.yreview.bridge.SendRoute
import com.yeskiy.yreview.settings.ProductName
import com.yeskiy.yreview.store.StoreKind
import java.io.IOException
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The report goes to a public issue tracker.
 *
 * The first group of tests holds the facts a maintainer needs. The second group holds the
 * rule that decides whether this feature may ship. Every private value of the machine is
 * written into a record here on purpose. The report must drop all of them, whatever field
 * carries them, so a record that a later change fills in by mistake still cannot leak.
 */
class DiagnosticReportTest {

    private val home = "C:/Users/alice"

    private val project = "E:/work/demo-repo"

    /** The bridge token is 64 hexadecimal characters, as BridgeToken writes it. */
    private val token = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0"

    private val email = "alice@example.com"

    private val remote = "https://github.com/alice-corp/secret-app.git"

    private val at = LocalDateTime.of(2026, 9, 4, 10, 11, 12)

    private val machine = MachineFacts(
        pluginVersion = "1.0.0",
        ideBuild = "IU-262.9437.185",
        os = "Windows 11 10.0 amd64",
        javaVersion = "25.0.1",
        terminalPlugin = true,
        mcpPlugin = false,
    )

    private val facts = ReportFacts(
        machine = machine,
        channel = true,
        sharing = "Local only",
        sessionWindow = "not chosen",
        claudeCommand = "claude",
    )

    /** One record that carries every value the report must never show. */
    private val poisoned = SessionRecord.Session(
        at = "2026-09-04 10:11:12",
        command = "claude --token $token --config C:/Users/alice/AppData/Local/Temp/mcp.json",
        workingDirectory = project,
        bridgeReady = true,
        bridgeUrl = "http://127.0.0.1:64343",
        status = "The remote is $remote and the author is $email.",
        channelServer = "found at C:/Users/alice/plugins/y-review/channel/y-review-channel.jar",
        javaRuntime = "C:/Users/alice/idea/jbr/bin/java.exe",
        configFile = "C:/Users/alice/AppData/Local/Temp/claude-y-review-mcp-1.json",
        terminalStarted = true,
        processId = 4242,
    )

    private val failure = SessionRecord.Failure.of(
        work = "push the shared note",
        failure = IOException("git could not read $remote for $email under C:/Users/alice/work"),
        now = at,
    )

    private val send = SessionRecord.Send.of(
        report = SendReport(tasks = 3, batches = 1, streams = 1, route = SendRoute.CHANNEL),
        store = StoreKind.GIT,
        readers = 1,
        now = at,
    )

    private val report = DiagnosticReport.text(facts, listOf(poisoned, send, failure), listOf(home), project)

    // --- What a maintainer needs ---

    @Test
    fun `the head names the plugin version and the ide build`() {
        assertTrue(report.contains("1.0.0"), report)
        assertTrue(report.contains("IU-262.9437.185"), report)
    }

    @Test
    fun `the head names the two optional plugins`() {
        assertTrue(DiagnosticReport.head(machine).contains("terminal"))
        assertTrue(DiagnosticReport.head(machine).contains("mcpServer"))
    }

    @Test
    fun `the head opens with a line that says what the report is`() {
        assertTrue(DiagnosticReport.head(machine).startsWith("${ProductName.TEXT} diagnostic report"))
    }

    @Test
    fun `the report names the switches of the project`() {
        assertTrue(report.contains("channel"), report)
        assertTrue(report.contains("Local only"), report)
    }

    @Test
    fun `the report keeps the counts the routes and the kinds`() {
        assertTrue(report.contains("channel"), report)
        assertTrue(report.contains("git"), report)
        assertTrue(report.contains("readers"), report)
        assertTrue(report.contains("java.io.IOException"), report)
    }

    @Test
    fun `the report keeps the loopback address of the bridge`() {
        assertTrue(report.contains("http://127.0.0.1:64343"), "a maintainer needs the port")
    }

    @Test
    fun `the report names how many records it holds`() {
        assertTrue(report.contains("Records, newest first (3 of ${SessionLog.LIMIT})"), report)
    }

    // --- The rule that decides whether this ships ---

    @Test
    fun `the report never carries the bridge token`() {
        assertFalse(report.contains(token), "the token is the only guard on the loopback port")
    }

    @Test
    fun `the report never carries a part of the bridge token`() {
        assertFalse(report.contains(token.take(12)), "a shortened token is still the start of the token")
    }

    @Test
    fun `the report never carries an absolute path of the user`() {
        assertFalse(report.contains(home), report)
        assertFalse(report.contains(project), report)
        assertFalse(report.contains("alice"), "an absolute path under the home folder names the user")
    }

    @Test
    fun `the report never carries the git remote`() {
        assertFalse(report.contains(remote), report)
        assertFalse(report.contains("github.com"), "a remote address names a host and often a user")
    }

    @Test
    fun `the report never carries the electronic mail address of the user`() {
        assertFalse(report.contains(email), report)
        assertFalse(report.contains("example.com"), report)
    }

    @Test
    fun `the rules hold when the machine is not known`() {
        val text = DiagnosticReport.text(facts, listOf(poisoned, failure), emptyList(), null)

        assertFalse(text.contains(token), "the token rule must not depend on the home folder")
        assertFalse(text.contains(email), "the mail rule must not depend on the home folder")
        assertFalse(text.contains(remote), "the remote rule must not depend on the home folder")
    }

    /**
     * The redaction is the second guard. The first guard is the list of fields itself. A
     * send record counts the tasks, and it holds no field that can carry the text of a
     * comment or the name of an author.
     */
    @Test
    fun `a send record holds counts and states only`() {
        assertEquals(
            listOf("route", "store", "readers", "tasks", "batches", "dropped", "problem"),
            send.facts().map { it.first },
        )
    }
}
