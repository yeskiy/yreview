package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class SendPicksTest {

    private val first = SessionChoice("aaaaaaaaaaaaaaaa", "Claude 1")
    private val second = SessionChoice("bbbbbbbbbbbbbbbb", "Claude 2")

    @Test
    fun `nothing to reach means no session to pick`() {
        assertEquals(SendPick.None, SendPicks.of(emptyList(), pushPossible = true))
    }

    @Test
    fun `a send that no route can push names no session`() {
        assertEquals(SendPick.None, SendPicks.of(listOf(first, second), pushPossible = false))
    }

    @Test
    fun `a folder store route never allows a session target`() {
        // SendRoutes decides whether a push can happen, and the picker asks it.
        // One rule, two readers, so the button and the send can never disagree.
        val route = SendRoutes.of(channel = true, receivers = 2, gitRepository = false)

        assertEquals(SendRoute.NO_REPOSITORY, route)
        assertEquals(SendPick.None, SendPicks.of(listOf(first, second), pushPossible = route == SendRoute.CHANNEL))
    }

    @Test
    fun `one named session needs no question`() {
        assertEquals(SendPick.One(first), SendPicks.of(listOf(first), pushPossible = true))
    }

    @Test
    fun `a second stream on the key of one tab still leaves one target`() {
        // BridgeService counts the tabs and no stream, and a unit test cannot build it,
        // because it is a project service and the test set holds no platform fixture.
        // A background job of the tab opens a second stream on the key of that tab.
        // The count of receivers therefore stays at one, and this test states that one.
        val route = SendRoutes.of(channel = true, receivers = 1, gitRepository = true)

        assertEquals(SendRoute.CHANNEL, route)
        assertEquals(SendPick.One(first), SendPicks.of(listOf(first), pushPossible = route == SendRoute.CHANNEL))
    }

    @Test
    fun `a stream with no key sends the tasks to the clipboard`() {
        // BridgeService counts the tabs and no stream, and a unit test cannot build it,
        // because it is a project service and the test set holds no platform fixture.
        // A stream that no tab owns belongs to a session that the plugin did not start.
        // Such a session takes no push, so the count of receivers is zero.
        val route = SendRoutes.of(channel = true, receivers = 0, gitRepository = true)

        assertEquals(SendRoute.NO_SESSION, route)
        assertEquals(SendPick.None, SendPicks.of(emptyList(), pushPossible = route == SendRoute.CHANNEL))
    }

    @Test
    fun `two tabs raise a question that ends with the row for every session`() {
        val route = SendRoutes.of(channel = true, receivers = 2, gitRepository = true)
        val pick = SendPicks.of(listOf(first, second), pushPossible = route == SendRoute.CHANNEL)

        assertIs<SendPick.Ask>(pick)
        assertEquals(listOf("Claude 1", "Claude 2", SendPicks.EVERY_NAME), pick.choices.map { it.name })
        assertEquals(listOf("aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", null), pick.choices.map { it.key })
        assertEquals(SendPicks.EVERY_NAME, pick.choices.last().name)
    }

    @Test
    fun `the row that holds every session promises the channel and nothing more`() {
        // With one channel tab and one tab of another transport, a send with no target
        // reaches the channel reader alone. The name of the row must not say more.
        assertEquals("Every session that reads the channel", SendPicks.EVERY_NAME)
    }

    @Test
    fun `the button names one session`() {
        assertEquals(
            "Send Checked (3) to Claude 1",
            SendPicks.buttonText("Send Checked (3)", SendPick.One(first), sendable = true),
        )
    }

    @Test
    fun `the button shows three dots when a choice follows`() {
        assertEquals(
            "Send Checked (3) to a Session...",
            SendPicks.buttonText(
                "Send Checked (3)",
                SendPicks.of(listOf(first, second), pushPossible = true),
                sendable = true,
            ),
        )
    }

    @Test
    fun `the button keeps its plain words when nothing can take a send`() {
        // An agent that takes no send never reaches the named list, and a stream that no
        // tab owns adds nothing. The send then copies the prompt.
        assertEquals(SendPick.None, SendPicks.of(emptyList(), pushPossible = true))
        assertEquals("Send All (2)", SendPicks.buttonText("Send All (2)", SendPick.None, sendable = true))
    }

    @Test
    fun `the button keeps its plain words with no task`() {
        assertEquals(
            "Send to the Agent",
            SendPicks.buttonText("Send to the Agent", SendPick.One(first), sendable = false),
        )
    }
}
