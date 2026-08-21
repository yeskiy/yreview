package com.yeskiy.yreview.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.io.path.deleteIfExists
import kotlin.io.path.isRegularFile
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChannelConfigTest {

    private val nodePath = "C:\\Program Files\\nodejs\\node.exe"

    private val serverPath = "C:\\Users\\one\\plugins\\y-review\\channel\\main.mjs"

    private fun text() = ChannelConfig.text(nodePath, serverPath)

    private fun entry(text: String) =
        Json.parseToJsonElement(text).jsonObject["mcpServers"]!!.jsonObject["y-review"]!!.jsonObject

    @Test
    fun `the file declares one stdio server named y-review`() {
        val servers = Json.parseToJsonElement(text()).jsonObject["mcpServers"]!!.jsonObject

        assertEquals(setOf("y-review"), servers.keys)
        assertEquals("stdio", servers["y-review"]!!.jsonObject["type"]!!.jsonPrimitive.content)
    }

    @Test
    fun `the server runs the node of this machine with the channel server of the plugin`() {
        val entry = entry(text())

        assertEquals(nodePath, entry["command"]!!.jsonPrimitive.content)
        assertEquals(listOf(serverPath), entry["args"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test
    fun `the file carries no environment block`() {
        // The session hands the bridge address and the bridge token to the server through
        // the environment of the terminal. A token in a file outlives the session.
        val entry = entry(text())

        assertFalse(entry.containsKey("env"))
        assertEquals(setOf("type", "command", "args"), entry.keys)
    }

    @Test
    fun `the file holds no bridge variable`() {
        assertFalse(text().contains("Y_REVIEW_BRIDGE"))
    }

    @Test
    fun `a written file holds the same text and a delete removes it`() {
        val file = ChannelConfig.write(nodePath, serverPath)
        try {
            assertTrue(file.isRegularFile())
            assertEquals(text(), file.readText())
            assertTrue(file.fileName.toString().endsWith(".json"))
        } finally {
            file.deleteIfExists()
        }

        val second = ChannelConfig.write(nodePath, serverPath)
        ChannelConfig.delete(second)
        assertFalse(second.isRegularFile())
    }

    @Test
    fun `a delete of nothing changes nothing`() {
        ChannelConfig.delete(null)
    }
}
