package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * The rule that decides the loopback server of one session.
 *
 * The rule stands apart from the panel, because the panel runs it on a pooled thread and
 * the mount reads the answer on the thread that draws the window. The parts of the server
 * stand together, and a start that misses one of them opens no port.
 */
class LocalServerTest {

    @Test
    fun `an agent with no server of its own opens no port`() {
        var picked = false

        val server = LocalServer.of(
            AgentCatalog.of(AgentId.CLAUDE),
            pick = {
                picked = true
                PORT
            },
            token = { PASSWORD },
        ) { FILE }

        assertNull(server)
        assertFalse(picked, "an agent that runs no server must bind no port")
    }

    @Test
    fun `a machine that gives no port writes no password`() {
        var written = false

        val server = LocalServer.of(
            AgentCatalog.of(AgentId.OPENCODE),
            pick = { null },
            token = { PASSWORD },
        ) {
            written = true
            FILE
        }

        assertNull(server)
        assertFalse(written, "a start with no port must leave no secret on the disk")
    }

    @Test
    fun `a failed write of the password file leaves no port`() {
        // A server that starts with no password answers every unauthenticated request of
        // this machine, so the port dies with the file that carries the password.
        val server = LocalServer.of(
            AgentCatalog.of(AgentId.OPENCODE),
            pick = { PORT },
            token = { PASSWORD },
        ) { null }

        assertNull(server)
    }

    @Test
    fun `a start that writes the file carries the port and the password`() {
        val server = assertNotNull(
            LocalServer.of(
                AgentCatalog.of(AgentId.OPENCODE),
                pick = { PORT },
                token = { PASSWORD },
            ) { FILE }
        )

        assertEquals(PORT, server.port)
        assertEquals(PASSWORD, server.password)
        assertEquals(FILE, server.passwordFile)
    }

    @Test
    fun `the file carries the password that the server holds`() {
        val server = assertNotNull(
            LocalServer.of(
                AgentCatalog.of(AgentId.OPENCODE),
                pick = { PORT },
                token = { PASSWORD },
            ) { if (it == PASSWORD) FILE else null }
        )

        assertEquals(PASSWORD, server.password)
    }

    @Test
    fun `the password never reaches a log`() {
        assertEquals("LocalServer(port=$PORT)", LocalServer(PORT, PASSWORD, FILE).toString())
    }

    private companion object {
        const val PORT = 47821

        /** A throwaway value. No session of a user ever runs with it. */
        const val PASSWORD = "8c1d05b7e3a94f26"

        const val FILE = "secret.txt"
    }
}
