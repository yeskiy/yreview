package com.yeskiy.yreview.session

/**
 * Reads the bridge file again until it holds an address, or until the time runs out.
 *
 * The startup activity of the project and the tool window race each other, and the tool
 * window can win. The caller runs this away from the user interface thread, because it
 * sleeps between the reads.
 */
object BridgeWait {

    const val WAIT_MILLIS = 3000L

    const val STEP_MILLIS = 100L

    /**
     * Returns the first address the probe reports. After the deadline it returns the last
     * answer of the probe, so the caller keeps the reason and starts without the channel.
     */
    fun poll(
        waitMillis: Long = WAIT_MILLIS,
        stepMillis: Long = STEP_MILLIS,
        clock: () -> Long = System::currentTimeMillis,
        pause: (Long) -> Unit = { millis -> Thread.sleep(millis) },
        probe: () -> BridgeLookup,
    ): BridgeLookup {
        val deadline = clock() + waitMillis
        return generateSequence(probe()) { previous ->
            if (previous is BridgeLookup.Available || clock() >= deadline) {
                null
            } else {
                pause(stepMillis)
                probe()
            }
        }.last()
    }
}
