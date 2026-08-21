package com.yeskiy.yreview.session

import kotlin.io.path.createDirectories
import kotlin.io.path.createTempDirectory
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class BridgeDiscoveryTest {

    private val token = "0123456789abcdef0123"

    private fun file(text: String): BridgeLookup {
        val home = createTempDirectory("y-review-home")
        val directory = home.resolve(".y-review").resolve("bridge")
        directory.createDirectories()
        directory.resolve(BridgeDiscovery.fileName("E:/Project")).writeText(text)
        return BridgeDiscovery.find(home, "E:/Project")
    }

    @Test
    fun `the file name replaces every character that is not a letter or a digit`() {
        assertEquals("E--Projects-Opened-y-review.json", BridgeDiscovery.fileName("E:/work/demo"))
    }

    @Test
    fun `a backslash path gives the same file name as a slash path`() {
        assertEquals(
            BridgeDiscovery.fileName("E:/work/demo"),
            BridgeDiscovery.fileName("E:\\Projects\\Opened\\y-review")
        )
    }

    @Test
    fun `the file sits under the bridge directory of the home directory`() {
        val home = createTempDirectory("y-review-home")
        assertEquals(
            home.resolve(".y-review").resolve("bridge").resolve("E--Project.json"),
            BridgeDiscovery.fileFor(home, "E:/Project")
        )
    }

    @Test
    fun `a good file gives the address and the token`() {
        val found = file("{\"url\":\"http://127.0.0.1:52431\",\"token\":\"$token\",\"pid\":1234}")
        assertEquals(BridgeLookup.Available("http://127.0.0.1:52431", token), found)
    }

    @Test
    fun `a missing file is not an error`() {
        val home = createTempDirectory("y-review-home")
        assertIs<BridgeLookup.Unavailable>(BridgeDiscovery.find(home, "E:/Project"))
    }

    @Test
    fun `a short token is refused`() {
        assertIs<BridgeLookup.Unavailable>(file("{\"url\":\"http://127.0.0.1:52431\",\"token\":\"short\"}"))
    }

    @Test
    fun `an address that is not loopback is refused`() {
        assertIs<BridgeLookup.Unavailable>(file("{\"url\":\"http://10.0.0.5:52431\",\"token\":\"$token\"}"))
    }

    @Test
    fun `an address that is not http is refused`() {
        assertIs<BridgeLookup.Unavailable>(file("{\"url\":\"https://127.0.0.1:52431\",\"token\":\"$token\"}"))
    }

    @Test
    fun `localhost is a loopback address`() {
        assertIs<BridgeLookup.Available>(file("{\"url\":\"http://localhost:52431\",\"token\":\"$token\"}"))
    }

    @Test
    fun `a broken file is refused`() {
        assertIs<BridgeLookup.Unavailable>(file("not json"))
    }

    @Test
    fun `a file without a token is refused`() {
        assertIs<BridgeLookup.Unavailable>(file("{\"url\":\"http://127.0.0.1:52431\"}"))
    }

    @Test
    fun `a refusal never repeats the token`() {
        val reasons = listOf(
            file("{\"url\":\"https://127.0.0.1:52431\",\"token\":\"$token\"}"),
            file("{\"url\":\"http://10.0.0.5:52431\",\"token\":\"$token\"}")
        )
        reasons.forEach { lookup ->
            assertFalse(assertIs<BridgeLookup.Unavailable>(lookup).reason.contains(token))
            assertTrue(assertIs<BridgeLookup.Unavailable>(lookup).reason.isNotEmpty())
        }
    }
}
