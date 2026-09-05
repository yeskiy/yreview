package com.yeskiy.yreview.channel

import io.modelcontextprotocol.kotlin.sdk.server.StdioServerTransport
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.io.asSink
import kotlinx.io.asSource
import kotlinx.io.buffered
import java.io.FileDescriptor
import java.io.FileOutputStream
import java.io.OutputStream
import kotlin.system.exitProcess

private const val BAD_CONFIG_EXIT = 2

private fun log(message: String) = System.err.println("${ReviewChannel.SERVER_NAME}: $message")

/**
 * Takes the real standard output before any library can write to it.
 *
 * Claude Code reads the protocol on standard output, so one stray line there ends the
 * session. The stream of the protocol goes through this handle, and [System.out] points
 * at standard error from the first line of [main].
 */
private fun claimProtocolStream(): OutputStream {
    val protocol = FileOutputStream(FileDescriptor.out)
    System.setProperty("kotlin-logging.logStartupMessage", "false")
    System.setOut(System.err)
    return protocol
}

/**
 * Starts one channel server on standard input and standard output.
 *
 * Claude Code starts this process, names the bridge file of the project in the
 * environment, and reads the Model Context Protocol on standard output. The server opens
 * that file and takes the address and the token from it. Every message of this server goes
 * to standard error, so the protocol stream stays clean.
 */
fun main() {
    val protocol = claimProtocolStream()
    val config = try {
        Config.parse(System.getenv())
    } catch (bad: ConfigError) {
        log(bad.message.orEmpty())
        log("set ${Config.FILE_VARIABLE}, then start the server again")
        exitProcess(BAD_CONFIG_EXIT)
    }

    runBlocking {
        val app = ChannelApp(config, onError = { error -> log(error.message ?: error.toString()) })
        val stopped = CompletableDeferred<Unit>()
        val transport = StdioServerTransport(
            input = System.`in`.asSource().buffered(),
            output = protocol.asSink().buffered(),
        )
        transport.onClose { stopped.complete(Unit) }
        Runtime.getRuntime().addShutdownHook(Thread { runBlocking { app.stop() } })

        app.connect(transport)
        log("ready, bridge on ${config.bridgeUrl}")
        stopped.await()
        app.stop()
    }
}
