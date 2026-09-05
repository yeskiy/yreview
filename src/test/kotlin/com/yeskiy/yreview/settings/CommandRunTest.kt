package com.yeskiy.yreview.settings

import com.yeskiy.yreview.session.ShellCommand
import org.junit.jupiter.api.Timeout
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The bound of the wait, proved against a real child process.
 *
 * The command of [NEVER_ENDS] reads the input pipe, and this test writes nothing into that
 * pipe. The command therefore never ends by itself, and only the bound stops it.
 *
 * Every test here carries a time limit. A run with no bound would otherwise hold the whole
 * build, and a build that never ends reports no failure.
 */
class CommandRunTest {

    @Test
    @Timeout(LIMIT_SECONDS)
    fun `a command that never ends stops at the bound`() {
        var started: Process? = null

        val answer = CommandRun.run(NEVER_ENDS, waitMillis = BOUND_MILLIS) { parts ->
            ProcessBuilder(parts).redirectErrorStream(true).start().also { started = it }
        }

        assertTrue(answer.timedOut, "a command over the bound must report the bound")
        assertFalse(answer.ok)
        assertFalse(started!!.isAlive, "the plugin must stop a process that ran over the bound")
    }

    @Test
    @Timeout(LIMIT_SECONDS)
    fun `the wait of a command that never ends stays near the bound`() {
        val begin = System.nanoTime()

        CommandRun.run(NEVER_ENDS, waitMillis = BOUND_MILLIS)

        assertTrue(
            (System.nanoTime() - begin) / NANOS_IN_MILLI < LATEST_MILLIS,
            "the wait must end soon after the bound",
        )
    }

    @Test
    @Timeout(LIMIT_SECONDS)
    fun `a command that ends gives its output`() {
        val answer = CommandRun.run(SAYS_HELLO)

        assertTrue(answer.ok, answer.output)
        assertFalse(answer.timedOut)
        assertEquals("hello", answer.output)
    }

    @Test
    @Timeout(LIMIT_SECONDS)
    fun `a command that fails gives no good answer`() {
        val answer = CommandRun.run(FAILS)

        assertFalse(answer.ok)
        assertFalse(answer.timedOut)
        assertEquals(EXIT_CODE, answer.exitCode)
    }

    private companion object {
        const val LIMIT_SECONDS = 60L
        const val BOUND_MILLIS = 500L
        const val LATEST_MILLIS = 20000L
        const val NANOS_IN_MILLI = 1000000L
        const val EXIT_CODE = 3

        /** Reads the input pipe. Nobody writes there, so the command waits with no end. */
        val NEVER_ENDS: List<String> =
            if (ShellCommand.onWindows()) listOf("cmd", "/c", "pause") else listOf("cat")

        val SAYS_HELLO: List<String> =
            if (ShellCommand.onWindows()) listOf("cmd", "/c", "echo", "hello") else listOf("echo", "hello")

        val FAILS: List<String> =
            if (ShellCommand.onWindows()) listOf("cmd", "/c", "exit", "$EXIT_CODE") else listOf("sh", "-c", "exit $EXIT_CODE")
    }
}
