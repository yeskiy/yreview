package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.BridgeToken

/**
 * The loopback server that one session runs for itself.
 *
 * Only an agent that takes a push over a server of its own opens one. The port, the
 * password, and the file that carries the password to the shell stand together. A start
 * that misses one part opens no port at all. A server that starts with no password answers
 * every unauthenticated request of this machine.
 *
 * The password is a secret, so [toString] leaves it out and no log can carry it.
 */
data class LocalServer(val port: Int, val password: String, val passwordFile: String) {

    override fun toString(): String = "LocalServer(port=$port)"

    companion object {

        /**
         * Opens the server that [agent] needs, and answers null when this start opens none.
         *
         * [pick] answers a free port, and null when the machine gives none. [write] puts
         * the password on disk and answers the path of that file, and null after a failed
         * write. Both touch the machine, so this call must stand away from the thread that
         * draws the window.
         *
         * The password reaches the disk only after a port stands, so a start that gets no
         * port leaves no secret behind.
         */
        fun of(
            agent: AgentSpec,
            pick: () -> Int? = { FreePort.pick() },
            token: () -> String = { BridgeToken.newToken() },
            write: (String) -> String?,
        ): LocalServer? {
            if (agent.push != PushKind.LOCAL_HTTP) return null
            val port = pick() ?: return null
            val password = token()
            return write(password)?.let { LocalServer(port, password, it) }
        }
    }
}
