package com.yeskiy.yreview.bridge

import com.intellij.openapi.diagnostic.logger
import com.yeskiy.yreview.diagnostic.Redact
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

    private val logger = logger<OpenCodeClient>()

    @Serializable
    private data class Prompt(val text: String)

    /**
     * The client of every call. It speaks HTTP version 1.1, and it asks for nothing else.
     *
     * A client of the default version asks a plain HTTP server to change to version 2.
     * The OpenCode server takes such a request and does the work, and then it sends no
     * answer. The call runs into its deadline, and the plugin reads a failure after an
     * append that the server already made.
     */
    val client: HttpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
        .build()

    fun appendBody(text: String): String = JSON.encodeToString(Prompt.serializer(), Prompt(text))

    fun authorization(password: String): String =
        "Basic " + Base64.getEncoder().encodeToString("$USER:$password".toByteArray(StandardCharsets.UTF_8))

    /** Null after a good push, or the text of the problem. The text never holds the password. */
    fun push(port: Int, password: String, text: String): String? {
        val append = post(port, password, APPEND_PATH, appendBody(text))
            .getOrElse { return report(APPEND_PATH, password, it) }
        if (append != OK) return "$APPEND_PATH answered $append."
        val submit = post(port, password, SUBMIT_PATH, "")
            .getOrElse { return report(SUBMIT_PATH, password, it) }
        if (submit != OK) return "$SUBMIT_PATH answered $submit."
        return null
    }

    /**
     * The text of a call that gave no answer. It names the path and the cause.
     *
     * The password travels in a header, so no address and no message of a failure holds
     * it. The plugin does not write the message of a failure, so the text drops the
     * password anyway.
     */
    fun problem(path: String, password: String, failure: Throwable): String =
        hide(password, "The OpenCode session did not answer at $path. The cause is ${cause(failure)}.")

    /**
     * The sessions that this server holds, or null after any failure.
     *
     * The plugin reads this list only to name a tab. A failure is therefore quiet. The tab
     * keeps the name it has, and the next poll tries again.
     */
    fun sessions(port: Int, password: String): List<OpenCodeSession>? = runCatching {
        val answer = client.send(
            HttpRequest.newBuilder(URI("http://$LOOPBACK:$port${OpenCodeTitle.LIST_PATH}"))
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .header("Authorization", authorization(password))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8),
        )
        if (answer.statusCode() == OK) OpenCodeTitle.parse(answer.body()) else null
    }.getOrNull()

    /** The status of the answer, or the failure of a call that got no answer. */
    private fun post(port: Int, password: String, path: String, body: String): Result<Int> = runCatching {
        client.send(
            HttpRequest.newBuilder(URI("http://$LOOPBACK:$port$path"))
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .header("Content-Type", "application/json")
                .header("Authorization", authorization(password))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        ).statusCode()
    }

    /**
     * Writes one failed call to the log of the IDE, and answers the text for the user.
     *
     * The log line holds a clean copy of the failure, so a reader gets the chain of causes
     * and the stack trace. The user and the reader of the log learn the same reason.
     */
    private fun report(path: String, password: String, failure: Throwable): String =
        problem(path, password, failure).also { logger.warn(it, Redact.failure(failure, Redact.homes(), null)) }

    /** The name of the class of a failure, and the message when the failure holds one. */
    private fun cause(failure: Throwable): String {
        val name = failure.javaClass.simpleName.ifEmpty { failure.javaClass.name }
        return failure.message?.trim()?.takeIf { it.isNotEmpty() }?.let { "$name: $it" } ?: name
    }

    /** Takes the password out of one text. An empty password matches every place, so it stays. */
    private fun hide(password: String, text: String): String =
        if (password.isEmpty()) text else text.replace(password, Redact.SECRET_MARK)
}
