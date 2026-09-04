package com.yeskiy.yreview.session

import java.net.InetAddress
import java.net.ServerSocket

/**
 * Picks a loopback port that nothing holds right now.
 *
 * OpenCode prints no port and writes no file that names a running instance, so the plugin
 * must name the port itself. The socket closes before the agent starts, so a short window
 * stays open in which another process could take the same number. The agent then fails to
 * start, the terminal shows the reason, and the user presses Start again.
 */
object FreePort {

    private const val LOOPBACK = "127.0.0.1"

    private const val BACKLOG = 1

    /** Null when the machine gives no port at all. */
    fun pick(): Int? = runCatching {
        ServerSocket(0, BACKLOG, InetAddress.getByName(LOOPBACK)).use { it.localPort }
    }.getOrNull()
}
