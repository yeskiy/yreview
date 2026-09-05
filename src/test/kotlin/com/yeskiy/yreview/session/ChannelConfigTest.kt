package com.yeskiy.yreview.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.util.jar.JarFile
import kotlin.io.path.isRegularFile
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class ChannelConfigTest {

    private val javaPath = "C:\\Program Files\\JetBrains\\jbr\\bin\\java.exe"

    private val serverPath = "C:\\Users\\one\\plugins\\y-review\\channel\\y-review-channel.jar"

    private fun text() = ChannelConfig.text(AgentId.CLAUDE, javaPath, serverPath)

    private fun entry(text: String) =
        Json.parseToJsonElement(text).jsonObject["mcpServers"]!!.jsonObject["y-review"]!!.jsonObject

    private fun withHome(body: (Path) -> Unit) {
        val home = Files.createTempDirectory("y-review-home")
        try {
            body(home)
        } finally {
            home.toFile().deleteRecursively()
        }
    }

    @Test
    fun `the file declares one stdio server named y-review`() {
        val servers = Json.parseToJsonElement(text()).jsonObject["mcpServers"]!!.jsonObject

        assertEquals(setOf("y-review"), servers.keys)
        assertEquals("stdio", servers["y-review"]!!.jsonObject["type"]!!.jsonPrimitive.content)
    }

    @Test
    fun `the server runs the java of the IDE with the channel server of the plugin`() {
        val entry = entry(text())

        assertEquals(javaPath, entry["command"]!!.jsonPrimitive.content)
        assertEquals(
            listOf("-cp", serverPath, ChannelServer.MAIN_CLASS),
            entry["args"]!!.jsonArray.map { it.jsonPrimitive.content }
        )
    }

    @Test
    fun `the jar of the channel server names the same main class`() {
        // Two builds decide this name, and no compiler ties them together.
        val jar = File(System.getProperty("y.review.channel.jar").orEmpty())
        assertTrue(jar.isFile, "the channel jar is missing at ${jar.absolutePath}")
        JarFile(jar).use {
            assertEquals(ChannelServer.MAIN_CLASS, it.manifest.mainAttributes.getValue("Main-Class"))
        }
    }

    @Test
    fun `the file carries no environment block`() {
        // The environment of the terminal names the bridge file, and the server reads the
        // address and the token from that file. This file outlives the session.
        val entry = entry(text())

        assertFalse(entry.containsKey("env"))
        assertEquals(setOf("type", "command", "args"), entry.keys)
    }

    @Test
    fun `the file holds no bridge variable`() {
        assertFalse(text().contains("Y_REVIEW_BRIDGE"))
    }

    @Test
    fun `a written file stands at the stable path and holds the text`() {
        withHome { home ->
            val file = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)

            assertEquals(ConfigFile.path(home, AgentId.CLAUDE), file)
            assertTrue(file.isRegularFile())
            assertEquals(text(), file.readText())
        }
    }

    @Test
    fun `two sessions of one agent write the same file and it stays`() {
        withHome { home ->
            val first = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)
            val second = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)

            assertEquals(first, second)
            assertTrue(second.isRegularFile())
        }
    }

    @Test
    fun `two agents write two files of their own shape`() {
        withHome { home ->
            val claude = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)
            val opencode = ChannelConfig.write(AgentId.OPENCODE, javaPath, serverPath, home)

            assertNotEquals(claude, opencode)
            assertTrue(claude.readText().contains("mcpServers"))
            assertTrue(opencode.readText().contains("\"mcp\""))
        }
    }

    @Test
    fun `the same content twice leaves the file alone`() {
        withHome { home ->
            val file = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)
            Files.setLastModifiedTime(file, FileTime.fromMillis(0))
            val before = Files.getLastModifiedTime(file)

            ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)

            assertEquals(before, Files.getLastModifiedTime(file))
            assertEquals(text(), file.readText())
        }
    }

    @Test
    fun `changed content writes the file again`() {
        withHome { home ->
            val file = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)
            Files.setLastModifiedTime(file, FileTime.fromMillis(0))
            val before = Files.getLastModifiedTime(file)
            val moved = "C:\\Program Files\\JetBrains\\jbr-26\\bin\\java.exe"

            ChannelConfig.write(AgentId.CLAUDE, moved, serverPath, home)

            assertEquals(ChannelConfig.text(AgentId.CLAUDE, moved, serverPath), file.readText())
            assertNotEquals(before, Files.getLastModifiedTime(file))
        }
    }

    @Test
    fun `a write leaves no temporary file beside the target`() {
        withHome { home ->
            val file = ChannelConfig.write(AgentId.CLAUDE, javaPath, serverPath, home)

            Files.list(file.parent).use { stream ->
                assertEquals(listOf(file), stream.toList())
            }
        }
    }

    @Test
    fun `opencode reads one array that holds the program and its arguments`() {
        val text = ChannelConfig.text(AgentId.OPENCODE, javaPath, serverPath)
        val entry = Json.parseToJsonElement(text).jsonObject["mcp"]!!.jsonObject["y-review"]!!.jsonObject

        assertEquals("local", entry["type"]!!.jsonPrimitive.content)
        assertEquals(
            listOf(javaPath, "-cp", serverPath, ChannelServer.MAIN_CLASS),
            entry["command"]!!.jsonArray.map { it.jsonPrimitive.content },
        )
        assertEquals(true, entry["enabled"]!!.jsonPrimitive.content.toBoolean())
    }

    @Test
    fun `every other agent reads the mcpServers shape`() {
        listOf(AgentId.CLAUDE, AgentId.GEMINI, AgentId.COPILOT, AgentId.CURSOR).forEach { id ->
            val text = ChannelConfig.text(id, javaPath, serverPath)

            assertTrue(text.contains("mcpServers"), id.name)
            assertFalse(text.contains("\"mcp\""), id.name)
        }
    }
}
