package com.yeskiy.yreview.settings

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Reads and writes the real key of the IDE. The registry of the platform holds the keys of
 * misc/registry.properties, and it needs no running IDE for a read or for a write. Outside
 * an IDE the registry writes one warning for every read, and it answers from that file.
 */
class RegistryStripTest {

    @AfterTest
    fun after() {
        RegistryStrip.reset()
    }

    @Test
    fun `the key of the plugin stands in the registry of this build`() {
        assertEquals("30", RegistryStrip.size())
        assertFalse(RegistryStrip.changedFromDefault())
    }

    @Test
    fun `a write reaches the registry and a reset drops it`() {
        RegistryStrip.set(EditorStrip.NONE)

        assertEquals("0", RegistryStrip.size())
        assertTrue(RegistryStrip.changedFromDefault())

        RegistryStrip.reset()

        assertEquals("30", RegistryStrip.size())
        assertFalse(RegistryStrip.changedFromDefault())
    }
}
