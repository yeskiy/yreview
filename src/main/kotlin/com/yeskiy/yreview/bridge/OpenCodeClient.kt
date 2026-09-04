package com.yeskiy.yreview.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Base64

/**
 * Puts one prompt into a running OpenCode session.
 *
 * OpenCode runs an HTTP server beside its terminal user interface. The plugin gives that
 * server a port at start, so the address is known and no discovery is needed. Two calls do
 * the work. The first one appends the text to the input box, and the second one sends it.
 *
 * The server answers 200 as soon as it publishes the event, so a good answer proves that
 * the server took the text. It does not prove that the session read it. No message of the
 * plugin may claim more than that.
 *
 * The plugin never sends a directory parameter, because one session owns one port. It
 * never clears the input box either, because text the user typed would be lost.
 */
object OpenCodeClient {

    /** The user name of the basic authentication of the OpenCode server. */
    const val USER = "opencode"

    const val PASSWORD_VARIABLE = "OPENCODE_SERVER_PASSWORD"

    const val APPEND_PATH = "/tui/append-prompt"

    const val SUBMIT_PATH = "/tui/submit-prompt"

    const val TIMEOUT_SECONDS = 5L

    private const val LOOPBACK = "127.0.0.1"

    private const val OK = 200

    private val JSON = Json

    @Serializable
    private data class Prompt(val text: String)

    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
        .build()

    fun appendBody(text: String): String = JSON.encodeToString(Prompt.serializer(), Prompt(text))

    fun authorization(password: String): String =
        "Basic " + Base64.getEncoder().encodeToString("$USER:$password".toByteArray(StandardCharsets.UTF_8))

    /** Null after a good push, or the text of the problem. The text never holds the password. */
    fun push(port: Int, password: String, text: String): String? {
        val append = post(port, password, APPEND_PATH, appendBody(text)) ?: return problem(APPEND_PATH)
        if (append != OK) return "$APPEND_PATH answered $append."
        val submit = post(port, password, SUBMIT_PATH, "") ?: return problem(SUBMIT_PATH)
        if (submit != OK) return "$SUBMIT_PATH answered $submit."
        return null
    }

    /** The status of the answer, or null when the call itself failed. */
    private fun post(port: Int, password: String, path: String, body: String): Int? = runCatching {
        client.send(
            HttpRequest.newBuilder(URI("http://$LOOPBACK:$port$path"))
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .header("Content-Type", "application/json")
                .header("Authorization", authorization(password))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        ).statusCode()
    }.getOrNull()

    /** The message names the path only. A cause can carry the address and the credentials. */
    private fun problem(path: String): String = "The OpenCode session did not answer at $path."
}
