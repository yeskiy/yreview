package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SessionRegistryTest {

    private val registry = SessionRegistry()

    @Test
    fun `an added session keeps its order`() {
        registry.add("aaaaaaaaaaaaaaaa", "Claude 1")
        registry.add("bbbbbbbbbbbbbbbb", "Claude 2")

        assertEquals(
            listOf(SessionEntry("aaaaaaaaaaaaaaaa", "Claude 1"), SessionEntry("bbbbbbbbbbbbbbbb", "Claude 2")),
            registry.entries(),
        )
    }

    @Test
    fun `a second add of one key replaces the name`() {
        registry.add("aaaaaaaaaaaaaaaa", "Claude 1")
        registry.add("aaaaaaaaaaaaaaaa", "Claude 9")

        assertEquals(listOf(SessionEntry("aaaaaaaaaaaaaaaa", "Claude 9")), registry.entries())
    }

    @Test
    fun `a rename keeps the place of the session`() {
        registry.add("aaaaaaaaaaaaaaaa", "Claude 1")
        registry.add("bbbbbbbbbbbbbbbb", "Claude 2")
        registry.rename("aaaaaaaaaaaaaaaa", "Claude 7")

        assertEquals("Claude 7", registry.nameOf("aaaaaaaaaaaaaaaa"))
        assertEquals(listOf("Claude 7", "Claude 2"), registry.entries().map { it.name })
    }

    @Test
    fun `a rename of a key that left changes nothing`() {
        registry.rename("cccccccccccccccc", "Claude 4")

        assertEquals(emptyList(), registry.entries())
    }

    @Test
    fun `a removed session is gone`() {
        registry.add("aaaaaaaaaaaaaaaa", "Claude 1")
        registry.remove("aaaaaaaaaaaaaaaa")

        assertEquals(emptyList(), registry.entries())
        assertNull(registry.nameOf("aaaaaaaaaaaaaaaa"))
    }

    @Test
    fun `a session reaches the bridge through the channel unless the caller says otherwise`() {
        registry.add("aaaaaaaaaaaaaaaa", "Claude 1")

        assertEquals(SessionReach.Channel, registry.reachOf("aaaaaaaaaaaaaaaa"))
    }

    @Test
    fun `a session keeps the reach the caller gave it`() {
        registry.add("bbbbbbbbbbbbbbbb", "OpenCode 1", SessionReach.LocalHttp(47821, "s3cret"))

        assertEquals(SessionReach.LocalHttp(47821, "s3cret"), registry.reachOf("bbbbbbbbbbbbbbbb"))
    }

    @Test
    fun `nothing reaches a session the registry does not hold`() {
        assertEquals(SessionReach.None, registry.reachOf("cccccccccccccccc"))
    }

    @Test
    fun `a rename keeps the reach`() {
        registry.add("bbbbbbbbbbbbbbbb", "OpenCode 1", SessionReach.LocalHttp(47821, "s3cret"))
        registry.rename("bbbbbbbbbbbbbbbb", "OpenCode 3")

        assertEquals("OpenCode 3", registry.nameOf("bbbbbbbbbbbbbbbb"))
        assertEquals(SessionReach.LocalHttp(47821, "s3cret"), registry.reachOf("bbbbbbbbbbbbbbbb"))
    }

    @Test
    fun `a new reach keeps the place and the name of the session`() {
        registry.add("aaaaaaaaaaaaaaaa", "Claude 1", SessionReach.None)
        registry.add("bbbbbbbbbbbbbbbb", "Claude 2", SessionReach.None)
        registry.setReach("aaaaaaaaaaaaaaaa", SessionReach.LocalHttp(47821, "s3cret"))

        assertEquals(listOf("Claude 1", "Claude 2"), registry.entries().map { it.name })
        assertEquals(SessionReach.LocalHttp(47821, "s3cret"), registry.reachOf("aaaaaaaaaaaaaaaa"))
    }

    @Test
    fun `a new reach for a key that left changes nothing`() {
        registry.setReach("cccccccccccccccc", SessionReach.Channel)

        assertEquals(emptyList(), registry.entries())
    }
}
