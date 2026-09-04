package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class SendPicksTest {

    private val first = SessionChoice("aaaaaaaaaaaaaaaa", "Claude 1")
    private val second = SessionChoice("bbbbbbbbbbbbbbbb", "Claude 2")

    @Test
    fun `nothing to reach means no session to pick`() {
        assertEquals(SendPick.None, SendPicks.of(emptyList(), outside = 0, pushPossible = true))
    }

    @Test
    fun `a send that no route can push names no session`() {
        assertEquals(SendPick.None, SendPicks.of(listOf(first, second), outside = 1, pushPossible = false))
    }

    @Test
    fun `a folder store route never allows a session target`() {
        // SendRoutes decides whether a push can happen, and the picker asks it.
        // One rule, two readers, so the button and the send can never disagree.
        val route = SendRoutes.of(channel = true, receivers = 2, gitRepository = false)

        assertEquals(SendRoute.NO_REPOSITORY, route)
        assertEquals(
            SendPick.None,
            SendPicks.of(listOf(first, second), outside = 0, pushPossible = route == SendRoute.CHANNEL),
        )
    }

    @Test
    fun `one named session needs no question`() {
        assertEquals(SendPick.One(first), SendPicks.of(listOf(first), outside = 0, pushPossible = true))
    }

    @Test
    fun `one session that this window does not know still gets the batch`() {
        // A session that started before the key existed carries no key, so it has no name.
        val pick = SendPicks.of(emptyList(), outside = 1, pushPossible = true)

        assertEquals(SendPick.One(SessionChoice(null, SendPicks.OUTSIDE_NAME)), pick)
    }

    @Test
    fun `two sessions raise a question and offer the channel row as well`() {
        val pick = SendPicks.of(listOf(first, second), outside = 0, pushPossible = true)

        assertIs<SendPick.Ask>(pick)
        assertEquals(listOf("Claude 1", "Claude 2", SendPicks.EVERY_NAME), pick.choices.map { it.name })
        assertEquals(listOf("aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", null), pick.choices.map { it.key })
    }

    @Test
    fun `a session outside this window raises the question too`() {
        val pick = SendPicks.of(listOf(first), outside = 2, pushPossible = true)

        assertIs<SendPick.Ask>(pick)
        assertEquals(listOf("Claude 1", SendPicks.EVERY_NAME), pick.choices.map { it.name })
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
                SendPicks.of(listOf(first, second), outside = 0, pushPossible = true),
                sendable = true,
            ),
        )
    }

    @Test
    fun `the button keeps its plain words when nothing can take a send`() {
        // An agent that takes no send never reaches the named list, and an agent with no
        // channel adds nothing to the outside count. The send then copies the prompt.
        assertEquals(SendPick.None, SendPicks.of(emptyList(), outside = 0, pushPossible = true))
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
