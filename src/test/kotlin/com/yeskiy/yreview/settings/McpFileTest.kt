package com.yeskiy.yreview.settings

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.io.path.writeText
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The file of Cursor can hold servers of other tools. A press on Add must keep them,
 * and a file that is not valid JSON must stay as it is.
 */
class McpFileTest {

    private val folder: Path = Files.createTempDirectory("mcp-file-test")

    private val file: Path = folder.resolve(".cursor/mcp.json")

    private val wanted = """{"mcpServers":{"y-review":{"type":"stdio","command":"java","args":["-cp","server.jar"]}}}"""

    @AfterTest
    fun clean() {
        folder.toFile().deleteRecursively()
    }

    private fun document(): JsonObject = Json.parseToJsonElement(file.readText()).jsonObject

    private fun servers(): JsonObject = document().getValue("mcpServers").jsonObject

    private fun command(server: String): String =
        servers().getValue(server).jsonObject.getValue("command").jsonPrimitive.content

    private fun place(text: String) {
        Files.createDirectories(file.parent)
        file.writeText(text)
    }

    private fun names(): List<String> = file.parent.toFile().list()!!.toList()

    @Test
    fun `the merge keeps the other servers and the other keys`() {
        place("""{"mcpServers":{"other":{"command":"node","args":["a.js"]}},"inputs":[1]}""")

        assertNull(McpFile.write(file, wanted))

        assertEquals(setOf("other", "y-review"), servers().keys)
        assertEquals("node", command("other"))
        assertEquals("java", command("y-review"))
        assertTrue(document().containsKey("inputs"))
    }

    @Test
    fun `the merge replaces an old entry of the review server`() {
        place("""{"mcpServers":{"y-review":{"command":"old"}}}""")

        assertNull(McpFile.write(file, wanted))

        assertEquals("java", command("y-review"))
    }

    @Test
    fun `a file that is not valid JSON stays unchanged`() {
        val broken = """{"mcpServers": {"other": """
        place(broken)

        assertNotNull(McpFile.write(file, wanted))

        assertEquals(broken, file.readText())
        assertEquals(listOf("mcp.json"), names(), "no temporary file stays")
    }

    @Test
    fun `a servers key that holds no object stays unchanged`() {
        val odd = """{"mcpServers":[]}"""
        place(odd)

        assertNotNull(McpFile.write(file, wanted))

        assertEquals(odd, file.readText())
    }

    @Test
    fun `a missing file is created`() {
        assertNull(McpFile.write(file, wanted))

        assertEquals(setOf("y-review"), servers().keys)
        assertEquals(listOf("mcp.json"), names(), "no temporary file stays")
    }
}
