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
 * Everything that names one tab.
 *
 * [agent] is the short name of the agent of the tab, and it is null while nobody chose an
 * agent. [byAgent] is the name that the agent gave its own session, and [byUser] is the
 * name that the user typed for this tab. Both are null while nobody named the session.
 */
data class TabFacts(
    val number: Int,
    val agent: String?,
    val state: SessionState,
    val byAgent: String? = null,
    val byUser: String? = null,
)

/**
 * The rules of the session tabs.
 *
 * Every tab carries a number, and that number names the tab while nothing else does. A new
 * tab takes the smallest number that no open tab holds, so a user who closes the second tab
 * of three gets the number two again on the next start.
 *
 * Three names can stand for one tab, so the order is fixed. The name that the agent gave
 * its own session comes first, because it describes the session that runs now. The name
 * that the user typed comes next, because it belongs to the tab and outlives one session.
 * The built name comes last.
 *
 * The bridge serves a fixed number of event streams. A session over that number reads no
 * comment and gives no reason for it, so the window opens no tab over the same number.
 */
object SessionRules {

    /** The stem of a tab that names no agent. A tab always carries a name. */
    const val PLAIN = "Session"

    /** The longest tab text. A longer name pushes every other tab off the bar. */
    const val MAX_TAB = 24

    /** What stands at the end of a name that did not fit. */
    const val CUT = "..."

    /** The ceiling of the bridge. The window and the server read one number. */
    const val MAX_SESSIONS = BridgeServer.MAX_STREAMS

    fun freeNumber(taken: Set<Int>): Int = generateSequence(1) { it + 1 }.first { it !in taken }

    fun canOpen(open: Int): Boolean = open < MAX_SESSIONS

    /** The name that never changes with the state. The picker of the review window shows it. */
    fun name(facts: TabFacts): String = given(facts.byAgent)
        ?: given(facts.byUser)
        ?: "${facts.agent ?: PLAIN} ${facts.number}"

    /** The text on the tab. A long name is cut, and the tooltip then holds the whole one. */
    fun label(facts: TabFacts): String = fit(name(facts)) + suffix(facts.state)

    /** The text the tab shows on hover. It carries the whole name. */
    fun tooltip(facts: TabFacts): String = name(facts) + suffix(facts.state)

    /** Cuts a name to the width of a tab. A name that fits comes back as it is. */
    fun fit(text: String): String =
        if (text.length <= MAX_TAB) text else text.take(MAX_TAB - CUT.length).trimEnd() + CUT

    /** A name of spaces is no name, so the tab falls back to the next one in the order. */
    private fun given(text: String?): String? = text?.trim()?.takeIf { it.isNotEmpty() }

    private fun suffix(state: SessionState): String = when (state) {
        SessionState.RUNNING -> ""
        SessionState.NOT_STARTED -> " (not started)"
        SessionState.STARTING -> " (starting)"
        SessionState.ENDED -> " (ended)"
    }
}
