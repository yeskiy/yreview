package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.BridgeServer

/** What one review session does right now. The tab of that session shows this state. */
enum class SessionState {
    NOT_STARTED,
    STARTING,
    RUNNING,
    ENDED,
}

/**
 * The rules of the session tabs.
 *
 * Every tab carries a number, and that number names the tab. A new tab takes the smallest
 * number that no open tab holds, so a user who closes the second tab of three gets the
 * number two again on the next start.
 *
 * The bridge serves a fixed number of event streams. A session over that number reads no
 * comment and gives no reason for it, so the window opens no tab over the same number.
 */
object SessionRules {

    const val PREFIX = "Claude"

    /** The ceiling of the bridge. The window and the server read one number. */
    const val MAX_SESSIONS = BridgeServer.MAX_STREAMS

    fun freeNumber(taken: Set<Int>): Int = generateSequence(1) { it + 1 }.first { it !in taken }

    fun canOpen(open: Int): Boolean = open < MAX_SESSIONS

    /** The name that never changes. The picker of the review window shows it. */
    fun name(number: Int): String = "$PREFIX $number"

    /** The name on the tab. A running session shows the number alone. */
    fun label(number: Int, state: SessionState): String = name(number) + when (state) {
        SessionState.RUNNING -> ""
        SessionState.NOT_STARTED -> " (not started)"
        SessionState.STARTING -> " (starting)"
        SessionState.ENDED -> " (ended)"
    }
}
