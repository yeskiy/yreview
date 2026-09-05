package com.yeskiy.yreview.session

/**
 * The rule that starts a review session again after a lost port.
 *
 * The plugin picks a loopback port with [FreePort], closes the socket, and then starts the
 * agent. Another process can take that number in the gap. OpenCode then prints
 * "Error: Unexpected error" and exits. It binds no other port.
 *
 * A measured run shows that OpenCode exits 891 milliseconds after such a start. A session
 * that a person uses lives much longer, so the life of the session tells the two cases
 * apart. This rule reads that life only. It never reads which process holds a port.
 *
 * A new start picks a new port and a new password, because the mount does that work every
 * time. [MAX_TRIES] ends the chain, so a machine that hands out one taken port after
 * another still stops.
 */
object PortRetry {

    /** The most starts that one press on Start can make. The first start counts as one. */
    const val MAX_TRIES = 5

    /**
     * The longest life of a session that counts as a lost port.
     *
     * A start that lost the port ends after about 0.9 seconds. Five seconds stands far
     * over that time, and far under the life of a session that a person uses.
     */
    const val SHORT_MILLIS = 5_000L

    /**
     * True while the panel must start the session again.
     *
     * [push] is the push kind of the agent that ran. Only an agent on a loopback port can
     * lose that port. [livedMillis] is the time from the mount of the terminal to the end
     * of the process. [tries] is the number of starts that this press on Start already
     * made.
     */
    fun again(push: PushKind, livedMillis: Long, tries: Int): Boolean =
        push == PushKind.LOCAL_HTTP && livedMillis < SHORT_MILLIS && tries < MAX_TRIES
}
