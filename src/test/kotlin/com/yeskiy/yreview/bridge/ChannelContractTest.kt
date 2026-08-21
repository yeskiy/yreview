package com.yeskiy.yreview.bridge

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assumptions
import java.io.BufferedReader
import java.io.File
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Runs the real channel server against the real bridge.
 *
 * The channel is a Node process that Claude Code starts. The test starts it the same way,
 * points it at the bridge with the two environment variables, and reads the Model Context
 * Protocol messages on its standard output. The test skips itself when the channel is not
 * built, because a build without Node cannot run it.
 */
class ChannelContractTest {

    private val commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6"

    private val fullId = "c3f9a12aabbccddeeff00112233445566778899a"

    private val reported = mutableListOf<List<String>>()

    private val server = BridgeServer { ids ->
        reported.add(ids)
        null
    }

    private val address = server.start()

    private val lines = LinkedBlockingQueue<String>()

    private var channel: Process? = null

    @AfterTest
    fun tearDown() {
        channel?.destroyForcibly()
        server.stop()
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

    private fun startChannel(): Process {
        val main = File("channel/dist/main.js")
        Assumptions.assumeTrue(main.isFile, "channel/dist/main.js is missing. Run npm run build in channel.")
        val builder = ProcessBuilder("node", main.absolutePath)
        builder.environment()["Y_REVIEW_BRIDGE_URL"] = address.url
        builder.environment()["Y_REVIEW_BRIDGE_TOKEN"] = address.token
        val process = builder.start()
        channel = process
        read(process.inputStream.bufferedReader())
        read(process.errorStream.bufferedReader())
        return process
    }

    private fun read(reader: BufferedReader) {
        Thread {
            reader.useLines { all -> all.forEach { lines.put(it) } }
        }.apply { isDaemon = true }.start()
    }

    private fun send(process: Process, message: String) {
        process.outputStream.write("$message\n".toByteArray())
        process.outputStream.flush()
    }

    /** Reads the standard output until a message holds the text, or the wait runs out. */
    private fun awaitLine(holds: String): JsonObject {
        val deadline = System.currentTimeMillis() + 20_000
        while (System.currentTimeMillis() < deadline) {
            val line = lines.poll(1, TimeUnit.SECONDS) ?: continue
            if (!line.startsWith("{") || !line.contains(holds)) continue
            return Json.parseToJsonElement(line).jsonObject
        }
        error("no message held $holds")
    }

    private fun awaitStream() {
        val deadline = System.currentTimeMillis() + 20_000
        while (server.streamCount() == 0) {
            check(System.currentTimeMillis() < deadline) { "the channel never opened the event stream" }
            Thread.sleep(20)
        }
    }

    private fun handshake(): Process {
        val process = startChannel()
        send(
            process,
            """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",""" +
                """"capabilities":{},"clientInfo":{"name":"contract-test","version":"0.0.0"}}}""",
        )
        awaitLine(""""id":1""")
        send(process, """{"jsonrpc":"2.0","method":"notifications/initialized"}""")
        awaitStream()
        return process
    }

    @Test
    fun `the channel turns a batch of the bridge into one channel notification`() {
        handshake()
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
}
