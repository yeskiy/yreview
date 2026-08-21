package com.yeskiy.yreview.channel

import kotlin.test.Test
import kotlin.test.assertEquals

/** The frame reader of the event stream. One read gives any number of bytes. */
class DrainEventsTest {

    @Test
    fun `takes one whole event and keeps the rest`() {
        val drained = BridgeClient.drainEvents("data: one\n\ndata: par")

        assertEquals(listOf("one"), drained.events)
        assertEquals("data: par", drained.rest)
    }

    @Test
    fun `joins the data lines of one event`() {
        val drained = BridgeClient.drainEvents("data: one\ndata: two\n\n")

        assertEquals(listOf("one\ntwo"), drained.events)
        assertEquals("", drained.rest)
    }

    @Test
    fun `drops a comment line and an empty event`() {
        val drained = BridgeClient.drainEvents(": open\n\ndata: one\n\n")

        assertEquals(listOf("one"), drained.events)
    }

    @Test
    fun `reads a stream that ends its lines with a carriage return`() {
        val drained = BridgeClient.drainEvents("data: one\r\n\r\ndata: two\r\n\r\n")

        assertEquals(listOf("one", "two"), drained.events)
    }

    @Test
    fun `removes one space after the colon only`() {
        val drained = BridgeClient.drainEvents("data:  two spaces\n\n")

        assertEquals(listOf(" two spaces"), drained.events)
    }
}
