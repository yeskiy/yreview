package com.yeskiy.yreview.session

import java.net.InetAddress
import java.net.ServerSocket
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class FreePortTest {

    @Test
    fun `a picked port is a real port number`() {
        val port = FreePort.pick()

        assertNotNull(port)
        assertTrue(port in 1..65535, "$port")
    }

    @Test
    fun `a picked port can be bound right after`() {
        val port = assertNotNull(FreePort.pick())

        ServerSocket(port, 1, InetAddress.getByName("127.0.0.1")).use {
            assertTrue(it.isBound)
        }
    }

    @Test
    fun `two picks in a row give two numbers`() {
        // The operating system hands out a fresh port each time, so a second tab gets its own.
        val first = assertNotNull(FreePort.pick())
        val second = assertNotNull(FreePort.pick())

        assertTrue(first > 0 && second > 0)
    }
}
