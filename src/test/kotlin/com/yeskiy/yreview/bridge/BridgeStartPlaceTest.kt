package com.yeskiy.yreview.bridge

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.settings.ReviewSettings

/**
 * Where the bridge may start.
 *
 * A start binds a port and writes a file. The toolbar of the review window reads the
 * sessions while it draws itself, and the send action reads them again when the user
 * presses the button. Neither read may start a server.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class BridgeStartPlaceTest : BasePlatformTestCase() {

    override fun setUp() {
        super.setUp()
        ReviewSettings.getInstance(project).channel = true
    }

    override fun tearDown() {
        try {
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    private fun bridge(): BridgeService = BridgeService.getInstance(project)

    fun `test the session list starts no server`() {
        assertNull(bridge().address)

        bridge().liveChoices()

        assertNull("the list of sessions must bind no port", bridge().address)
    }

    fun `test the receiver count starts no server`() {
        assertNull(bridge().address)

        assertEquals(0, bridge().receiverCount())

        assertNull("the receiver count must bind no port", bridge().address)
    }

    fun `test the send still starts the server`() {
        assertNull(bridge().address)

        bridge().readerCount()

        assertNotNull("the send path must bring the bridge up", bridge().address)
    }

    fun `test the session list reads the server that already runs`() {
        bridge().start()

        assertEquals(0, bridge().liveChoices().size)
        assertNotNull(bridge().address)
    }
}
