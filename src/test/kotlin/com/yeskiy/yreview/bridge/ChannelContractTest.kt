package com.yeskiy.yreview.bridge

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.yeskiy.yreview.session.ChannelServer
import com.yeskiy.yreview.session.JavaRuntime
import org.junit.jupiter.api.Assumptions
import java.io.BufferedReader
import java.io.File
import java.nio.file.Files
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Runs the real channel server against the real bridge.
 *
 * The channel is a Java process that Claude Code starts. The test starts it the same way,
 * names a real bridge file in its environment, and reads the Model Context Protocol
 * messages on its standard output. The file comes from the writer of the plugin, so one
 * run proves the whole route from the plugin to the server.
 *
 * The file under test is the jar that the plugin ships. The Gradle test task builds that
 * jar first and names it in the y.review.channel.jar property.
 */
class ChannelContractTest {

    private val commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6"

    private val fullId = "c3f9a12aabbccddeeff00112233445566778899a"

    private val reported = mutableListOf<List<String>>()

    private val server = BridgeServer { ids, _ ->
        reported.add(ids)
        null
    }

    private val address = server.start()

    private val home = Files.createTempDirectory("y-review-contract")

    private val bridgeFile = DiscoveryFile.forProject(PROJECT, home).also {
        it.write(BridgeEntry(address.url, address.token, PROJECT, ProcessHandle.current().pid()))
    }

    private val lines = LinkedBlockingQueue<String>()

    private val channels = mutableListOf<Process>()

    @AfterTest
    fun tearDown() {
        channels.forEach { it.destroyForcibly() }
        server.stop()
        home.toFile().deleteRecursively()
    }

    private val batch = ReviewBatch(
        batchId = "b7f2a91",
        branch = "feat/bridge",
        commit = commit,
        comments = listOf(
            BatchComment(
                id = fullId,
                path = "src/main/kotlin/Parser.kt",
                startLine = 88,
                endLine = 94,
                revision = commit,
                text = "This branch never runs when the input is empty. Add the guard before the loop.",
            ),
        ),
    )

    private fun startChannel(key: String? = null, sink: LinkedBlockingQueue<String> = lines): Process {
        val jar = File(System.getProperty("y.review.channel.jar").orEmpty())
        Assumptions.assumeTrue(jar.isFile, "the channel jar is missing at ${jar.absolutePath}")
        val java = JavaRuntime.locate()
        Assumptions.assumeTrue(java != null, "this runtime names no java launcher")
        val builder = ProcessBuilder(java, "-cp", jar.absolutePath, ChannelServer.MAIN_CLASS)
        builder.environment()["Y_REVIEW_BRIDGE_FILE"] = bridgeFile.path.toString()
        key?.let { builder.environment()[SessionKey.VARIABLE] = it }
        val process = builder.start()
        channels.add(process)
        read(process.inputStream.bufferedReader(), sink)
        read(process.errorStream.bufferedReader(), sink)
        return process
    }

    private fun read(reader: BufferedReader, sink: LinkedBlockingQueue<String>) {
        Thread {
            reader.useLines { all -> all.forEach { sink.put(it) } }
        }.apply { isDaemon = true }.start()
    }

    private fun send(process: Process, message: String) {
        process.outputStream.write("$message\n".toByteArray())
        process.outputStream.flush()
    }

    /** Reads the standard output until a message holds the text, or the wait runs out. */
    private fun awaitLine(holds: String, sink: LinkedBlockingQueue<String> = lines): JsonObject {
        val deadline = System.currentTimeMillis() + 20_000
        while (System.currentTimeMillis() < deadline) {
            val line = sink.poll(1, TimeUnit.SECONDS) ?: continue
            if (!line.startsWith("{") || !line.contains(holds)) continue
            return Json.parseToJsonElement(line).jsonObject
        }
        error("no message held $holds")
    }

    /**
     * Reads every message of the session for the wait, and fails when one holds the text.
     *
     * This is the proof that a targeted send skipped a session. A single poll cannot prove
     * it, because the process writes other lines and the message can arrive after them.
     */
    private fun awaitSilence(holds: String, sink: LinkedBlockingQueue<String>) {
        val deadline = System.currentTimeMillis() + SILENCE_MS
        while (System.currentTimeMillis() < deadline) {
            val line = sink.poll(200, TimeUnit.MILLISECONDS) ?: continue
            assertFalse(line.contains(holds), "the other session received a message: $line")
        }
    }

    private fun awaitStreams(count: Int) {
        val deadline = System.currentTimeMillis() + 20_000
        while (server.streamCount() < count) {
            check(System.currentTimeMillis() < deadline) { "the channel never opened the event stream" }
            Thread.sleep(20)
        }
    }

    private fun handshake(key: String? = null, sink: LinkedBlockingQueue<String> = lines): Process {
        val process = startChannel(key, sink)
        send(
            process,
            """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",""" +
                """"capabilities":{},"clientInfo":{"name":"contract-test","version":"0.0.0"}}}""",
        )
        awaitLine(""""id":1""", sink)
        send(process, """{"jsonrpc":"2.0","method":"notifications/initialized"}""")
        return process
    }

    @Test
    fun `the channel turns a batch of the bridge into one channel notification`() {
        handshake()
        awaitStreams(1)
        assertEquals(1, server.send(batch))

        val notification = awaitLine("notifications/claude/channel")
        val params = notification["params"]!!.jsonObject
        assertEquals(
            "[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n" +
                "This branch never runs when the input is empty. Add the guard before the loop.",
            params["content"]!!.jsonPrimitive.content,
        )
        val meta = params["meta"]!!.jsonObject
        assertEquals("feat/bridge", meta["branch"]!!.jsonPrimitive.content)
        assertEquals(commit, meta["commit"]!!.jsonPrimitive.content)
        assertEquals("1", meta["count"]!!.jsonPrimitive.content)
        assertEquals("b7f2a91", meta["batch_id"]!!.jsonPrimitive.content)
    }

    @Test
    fun `the channel reports the full id to the bridge when the model resolves the short id`() {
        val process = handshake()
        awaitStreams(1)
        server.send(batch)
        awaitLine("notifications/claude/channel")

        send(
            process,
            """{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"review_resolve",""" +
                """"arguments":{"ids":["c3f9a12"]}}}""",
        )
        val answer = awaitLine(""""id":2""")
        assertTrue(answer["result"]!!.jsonObject["isError"] == null, answer.toString())
        assertEquals(listOf(listOf(fullId)), reported)
    }

    @Test
    fun `a targeted batch reaches one real session and not the other`() {
        val second = LinkedBlockingQueue<String>()
        handshake(FIRST_KEY)
        handshake(SECOND_KEY, second)
        awaitStreams(2)

        assertEquals(listOf(FIRST_KEY, SECOND_KEY).sorted(), server.openKeys().sorted())
        assertEquals(1, server.send(batch, target = FIRST_KEY))

        val notification = awaitLine(CHANNEL_NOTIFICATION)
        assertTrue(
            notification["params"]!!.jsonObject["content"]!!.jsonPrimitive.content.contains("c3f9a12"),
            notification.toString(),
        )
        awaitSilence(CHANNEL_NOTIFICATION, second)
    }

    @Test
    fun `a session without a key still reads a broadcast`() {
        // A session that started before the key existed reaches no chooser, and a send to
        // every session still has to arrive.
        handshake()
        awaitStreams(1)

        assertEquals(emptyList(), server.openKeys())
        assertEquals(1, server.send(batch))
        awaitLine(CHANNEL_NOTIFICATION)
    }

    private companion object {
        const val PROJECT = "E:/work/demo-repo"
        const val FIRST_KEY = "aaaaaaaaaaaaaaaa"
        const val SECOND_KEY = "bbbbbbbbbbbbbbbb"
        const val CHANNEL_NOTIFICATION = "notifications/claude/channel"
        const val SILENCE_MS = 3000L
    }
}
