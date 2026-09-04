package com.yeskiy.yreview.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AgentMcpTest {

    private val java = "C:\\Program Files\\JetBrains\\jbr\\bin\\java.exe"

    private val jar = "C:\\Users\\one\\plugins\\y-review\\channel\\y-review-channel.jar"

    private val file = "C:\\Temp\\y-review-mcp-1.json"

    private fun spec(id: AgentId) = AgentCatalog.of(id)

    @Test
    fun `claude code names the file on the command line`() {
        assertTrue(AgentMcp.needsFile(spec(AgentId.CLAUDE)))
        assertEquals(
            listOf("--mcp-config", file),
            AgentMcp.arguments(spec(AgentId.CLAUDE), java, jar, file),
        )
        assertEquals(emptyMap(), AgentMcp.variables(spec(AgentId.CLAUDE), file))
    }

    @Test
    fun `copilot puts an at sign in front of the file`() {
        assertEquals(
            listOf("--additional-mcp-config", "@$file"),
            AgentMcp.arguments(spec(AgentId.COPILOT), java, jar, file),
        )
    }

    @Test
    fun `opencode and gemini name the file in a variable`() {
        assertTrue(AgentMcp.needsFile(spec(AgentId.OPENCODE)))
        assertEquals(mapOf("OPENCODE_CONFIG" to file), AgentMcp.variables(spec(AgentId.OPENCODE), file))
        assertEquals(emptyList(), AgentMcp.arguments(spec(AgentId.OPENCODE), java, jar, file))
        assertEquals(
            mapOf("GEMINI_CLI_SYSTEM_DEFAULTS_PATH" to file),
            AgentMcp.variables(spec(AgentId.GEMINI), file),
        )
    }

    @Test
    fun `codex needs no file and carries two dotted keys`() {
        assertFalse(AgentMcp.needsFile(spec(AgentId.CODEX)))
        assertEquals(
            listOf(
                "-c",
                "mcp_servers.y-review.command=\"C:\\\\Program Files\\\\JetBrains\\\\jbr\\\\bin\\\\java.exe\"",
                "-c",
                "mcp_servers.y-review.args=[\"-cp\"," +
                    "\"C:\\\\Users\\\\one\\\\plugins\\\\y-review\\\\channel\\\\y-review-channel.jar\"," +
                    "\"com.yeskiy.yreview.channel.MainKt\"]",
            ),
            AgentMcp.arguments(spec(AgentId.CODEX), java, jar, null),
        )
    }

    @Test
    fun `codex gets no key while the plugin holds no server`() {
        // A key that names no jar would start a server that cannot run.
        assertEquals(emptyList(), AgentMcp.arguments(spec(AgentId.CODEX), java, null, null))
        assertEquals(emptyList(), AgentMcp.arguments(spec(AgentId.CODEX), null, jar, null))
    }

    @Test
    fun `no session argument reaches an agent with a stored route`() {
        listOf(AgentId.ANTIGRAVITY, AgentId.CURSOR, AgentId.AIDER, AgentId.AMP, AgentId.CUSTOM, AgentId.NONE)
            .forEach {
                assertEquals(emptyList(), AgentMcp.arguments(spec(it), java, jar, file), it.name)
                assertEquals(emptyMap(), AgentMcp.variables(spec(it), file), it.name)
                assertFalse(AgentMcp.needsFile(spec(it)), it.name)
            }
    }

    @Test
    fun `antigravity gets one command that the user approves`() {
        assertEquals(
            listOf("agy", "mcp", "add", "y-review", "--", java, "-cp", jar, "com.yeskiy.yreview.channel.MainKt"),
            AgentMcp.addCommand(spec(AgentId.ANTIGRAVITY), java, jar),
        )
    }

    @Test
    fun `only antigravity has an add command`() {
        AgentId.entries.filter { it != AgentId.ANTIGRAVITY }.forEach {
            assertNull(AgentMcp.addCommand(spec(it), java, jar), it.name)
        }
    }

    @Test
    fun `cursor gets a file that the user approves`() {
        val text = AgentMcp.userFile(spec(AgentId.CURSOR), java, jar)!!
        val entry = Json.parseToJsonElement(text).jsonObject["mcpServers"]!!.jsonObject["y-review"]!!.jsonObject

        assertEquals(java, entry["command"]!!.jsonPrimitive.content)
        assertEquals(
            listOf("-cp", jar, "com.yeskiy.yreview.channel.MainKt"),
            entry["args"]!!.jsonArray.map { it.jsonPrimitive.content },
        )
    }

    @Test
    fun `only cursor has a user file`() {
        AgentId.entries.filter { it != AgentId.CURSOR }.forEach {
            assertNull(AgentMcp.userFile(spec(it), java, jar), it.name)
        }
    }

    @Test
    fun `the help of a per session route says that nothing is asked`() {
        val text = AgentMcp.help(spec(AgentId.OPENCODE))

        assertTrue(text.contains("every session"), text)
        assertFalse(text.contains("Add"), text)
    }

    @Test
    fun `the help of a stored route says that the plugin asks first`() {
        assertTrue(AgentMcp.help(spec(AgentId.ANTIGRAVITY)).contains("Add"), "antigravity")
        assertTrue(AgentMcp.help(spec(AgentId.CURSOR)).contains("Add"), "cursor")
    }

    @Test
    fun `the help of an agent with no route names the file route`() {
        val text = AgentMcp.help(spec(AgentId.AIDER))

        assertTrue(text.contains("done.txt"), text)
        assertTrue(text.contains("tasks.json"), text)
    }

    @Test
    fun `no help text ever prints a port`() {
        // The port of the Model Context Protocol server of the IDE is not proved.
        AgentCatalog.ALL.forEach { assertFalse(AgentMcp.help(it).contains("64342"), it.label) }
    }
}
