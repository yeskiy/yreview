package com.yeskiy.yreview.session

/**
 * How a send reaches one review session.
 *
 * An open event stream proves that the tool server of a session is registered. It does not
 * prove that the session takes a send. Two cases show why. A session of an agent that reads
 * a loopback port of its own takes a send and opens no stream. A session of an agent that
 * ignores a pushed message can open a stream for its tools and still take no send.
 *
 * The plugin chooses the agent of a session, so the plugin records this value. The bridge
 * never guesses it.
 */
sealed interface SessionReach {

    /** True while a send arrives at a session of this kind. */
    fun takesSend(streamOpen: Boolean): Boolean

    /** A channel server of this session reads the bridge, and a send goes through it. */
    data object Channel : SessionReach {

        override fun takesSend(streamOpen: Boolean): Boolean = streamOpen
    }

    /**
     * The agent runs an HTTP server of its own, on this loopback port. The password is a
     * secret, so [toString] leaves it out and no log can carry it.
     */
    data class LocalHttp(val port: Int, val password: String) : SessionReach {

        override fun takesSend(streamOpen: Boolean): Boolean = true

        override fun toString(): String = "LocalHttp(port=$port)"
    }

    /** Nothing reaches this session. A send copies the prompt instead. */
    data object None : SessionReach {

        override fun takesSend(streamOpen: Boolean): Boolean = false
    }
}
