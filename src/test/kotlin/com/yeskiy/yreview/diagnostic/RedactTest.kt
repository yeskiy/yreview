package com.yeskiy.yreview.diagnostic

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A diagnostic report travels to a public issue tracker. The name of the user, the folder
 * layout of the user, the remote of the user, the address of the user and the bridge token
 * must never travel with it.
 */
class RedactTest {

    private val home = "C:/Users/alice"

    private val project = "E:/work/demo-repo"

    @Test
    fun `a home path becomes a tilde`() {
        assertEquals(
            "~/AppData/Local/Temp/claude-y-review-mcp-1.json",
            Redact.text("C:/Users/alice/AppData/Local/Temp/claude-y-review-mcp-1.json", home, project),
        )
    }

    @Test
    fun `a backslash home path becomes a tilde`() {
        assertEquals("~/plugins/y-review", Redact.text("""C:\Users\alice\plugins\y-review""", home, project))
    }

    @Test
    fun `the home match ignores the case of the drive letter`() {
        assertEquals("~/plugins", Redact.text("c:/USERS/alice/plugins", home, project))
    }

    @Test
    fun `a project path becomes a placeholder`() {
        assertEquals("<project>/src/main", Redact.text("E:/work/demo-repo/src/main", home, project))
    }

    @Test
    fun `a loopback address stays as it is`() {
        assertEquals("http://127.0.0.1:64343", Redact.text("http://127.0.0.1:64343", home, project))
    }

    @Test
    fun `the user name never survives`() {
        val line = """powershell.exe -NoLogo -Command & 'claude' '--mcp-config' 'C:\Users\alice\AppData\x.json'"""
        assertFalse(Redact.text(line, home, project).contains("alice"), "the report must not name the user")
    }

    @Test
    fun `both names of the home folder go out`() {
        assertEquals(
            "~/a.json and ~/b.json",
            Redact.text("C:/Users/alice/a.json and D:/profiles/alice/b.json", listOf(home, "D:/profiles/alice"), project),
        )
    }

    @Test
    fun `a git remote over https goes out`() {
        assertEquals(
            "the push failed to <remote>",
            Redact.text("the push failed to https://github.com/alice-corp/app.git", home, project),
        )
    }

    @Test
    fun `a git remote in the scp form goes out`() {
        assertEquals("<remote>", Redact.text("git@github.com:alice-corp/app.git", home, project))
    }

    @Test
    fun `an electronic mail address goes out`() {
        assertEquals("the author is <email>", Redact.text("the author is alice@example.com", home, project))
    }

    @Test
    fun `a bridge token goes out`() {
        val token = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0"

        val text = Redact.text("Y_REVIEW_BRIDGE_TOKEN=$token", home, project)

        assertFalse(text.contains(token), "the token guards the port")
        assertFalse(text.contains(token.take(12)), "a part of the token is still the start of the token")
        assertTrue(text.contains("<secret>"), text)
    }

    @Test
    fun `a token of another alphabet goes out as well`() {
        assertEquals("token=<secret>", Redact.text("token=Zm9vYmFyYmF6cXV4", home, project))
    }

    @Test
    fun `the rules need no knowledge of the machine`() {
        val text = Redact.text("mail alice@example.com over https://github.com/alice-corp/app.git", emptyList(), null)

        assertFalse(text.contains("alice"), "no home and no project path must not weaken the other rules")
    }

    @Test
    fun `a text without a private value stays as it is`() {
        assertEquals("the review bridge is not running", Redact.text("the review bridge is not running", home, project))
    }

    @Test
    fun `the message of a failure follows the same rules`() {
        val failure = java.nio.file.AccessDeniedException("E:/work/demo-repo/.git/yreview/tasks.json")

        val clean = Redact.failure(failure, listOf(home), project)

        assertEquals("java.nio.file.AccessDeniedException: <project>/.git/yreview/tasks.json", clean.toString())
        assertFalse(clean.toString().contains("demo-repo"), clean.toString())
    }

    @Test
    fun `a clean failure keeps the stack trace of the original`() {
        val failure = runCatching { error("no store at C:/Users/alice/store") }.exceptionOrNull()!!

        val clean = Redact.failure(failure, listOf(home), project)

        assertEquals(failure.stackTrace.toList(), clean.stackTrace.toList())
        assertTrue(clean.toString().contains("~/store"), clean.toString())
    }

    @Test
    fun `the cause of a failure is clean as well`() {
        val cause = java.io.IOException("E:/work/demo-repo/notes")
        val failure = RuntimeException("the read failed", cause)

        val clean = Redact.failure(failure, listOf(home), project)

        assertEquals("java.io.IOException: <project>/notes", clean.cause?.toString())
    }

    @Test
    fun `a failure without a message keeps its name`() {
        assertEquals(
            "java.lang.IllegalStateException",
            Redact.failure(IllegalStateException(), listOf(home), project).toString(),
        )
    }

    @Test
    fun `a ring of causes ends`() {
        val first = RuntimeException("first")
        val second = RuntimeException("second", first)
        first.initCause(second)

        assertEquals(Redact.CAUSES, depth(Redact.failure(first, listOf(home), project)))
    }

    private fun depth(failure: Throwable): Int =
        failure.cause?.let { 1 + depth(it) } ?: 0
}
