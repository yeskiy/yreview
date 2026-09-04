package com.yeskiy.yreview.bridge

/**
 * One target of a send. A null [key] means every open stream, which is what the bridge did
 * before it knew the sessions apart.
 */
data class SessionChoice(val key: String?, val name: String)

/** What one press of Send must do about the target session. */
sealed interface SendPick {

    /** The channel cannot carry this send, so no session is named. */
    data object None : SendPick

    /** One session reads, so the send goes there and the user answers nothing. */
    data class One(val choice: SessionChoice) : SendPick

    /** Two or more read, so the user picks one row, or the row that holds every one. */
    data class Ask(val choices: List<SessionChoice>) : SendPick
}

/**
 * Decides the target of a send, and the words the Send button carries.
 *
 * A user with one session must never answer a question, because there is only one answer.
 * A user with two or more must always answer, because a send to the wrong agent costs more
 * than one click.
 */
object SendPicks {

    /**
     * The row that sends with no target. The bridge then writes to every open event
     * stream, so the name says the channel and never promises more than that.
     */
    const val EVERY_NAME = "Every session that reads the channel"

    /** A session that this window did not start. It carries no key, so it has no name. */
    const val OUTSIDE_NAME = "the session outside this window"

    /**
     * [named] holds every session of this window that a send can reach right now, in the
     * order of the tabs. The transport does not matter here, because the caller already
     * asked each session whether a send reaches it.
     *
     * [outside] counts the sessions that read the channel and that this window did not
     * start. It cannot name them, so they reach the user only through the row that holds
     * every session.
     *
     * [pushPossible] is true only when the route of this send can carry a push at all. A
     * folder store, a closed channel switch, and an empty bridge each give false, and every
     * one of them sends the tasks to the clipboard. A target named for such a send would be
     * thrown away, so this method names none.
     */
    fun of(named: List<SessionChoice>, outside: Int, pushPossible: Boolean): SendPick {
        if (!pushPossible) return SendPick.None
        val total = named.size + outside
        return when {
            total == 0 -> SendPick.None
            total == 1 -> SendPick.One(named.singleOrNull() ?: SessionChoice(null, OUTSIDE_NAME))
            else -> SendPick.Ask(named + SessionChoice(null, EVERY_NAME))
        }
    }

    /** The words of the Send button. [base] holds the words about the tasks. */
    fun buttonText(base: String, pick: SendPick, sendable: Boolean): String = when {
        !sendable -> base
        pick is SendPick.One -> "$base to ${pick.choice.name}"
        pick is SendPick.Ask -> "$base to a Session..."
        else -> base
    }
}
