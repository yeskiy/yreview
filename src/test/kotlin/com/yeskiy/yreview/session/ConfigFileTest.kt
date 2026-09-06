package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class ConfigFileTest {

    private val home: Path = Path.of("E:", "home")

    private val idea = "IU"

    @Test
    fun `the file stands in the mcp folder of the plugin root`() {
        assertEquals(
            home.resolve(".y-review").resolve("mcp").resolve("claude-iu.json"),
            ConfigFile.path(home, AgentId.CLAUDE, idea),
        )
    }

    @Test
    fun `two sessions of one agent in one product name the same file`() {
        assertEquals(
            ConfigFile.path(home, AgentId.CLAUDE, idea),
            ConfigFile.path(home, AgentId.CLAUDE, idea),
        )
    }

    @Test
    fun `two agents name two files`() {
        assertEquals(
            AgentId.entries.size,
            AgentId.entries.map { ConfigFile.fileName(it, idea) }.toSet().size,
        )
    }

    @Test
    fun `two jetbrains products name two files`() {
        assertNotEquals(
            ConfigFile.path(home, AgentId.CLAUDE, idea),
            ConfigFile.path(home, AgentId.CLAUDE, "PY"),
        )
    }

    @Test
    fun `the file name holds the agent, the product and the json suffix`() {
        assertEquals("opencode-py.json", ConfigFile.fileName(AgentId.OPENCODE, "PY"))
    }

    @Test
    fun `a build that names no product still names a file`() {
        assertEquals("opencode-ide.json", ConfigFile.fileName(AgentId.OPENCODE, ""))
    }

    @Test
    fun `the file name holds no character that a file system refuses`() {
        assertEquals("opencode-iu-2026-2.json", ConfigFile.fileName(AgentId.OPENCODE, "IU/2026.2"))
    }

    @Test
    fun `a missing file needs a write`() {
        assertTrue(ConfigFile.needsWrite(null, "{}"))
    }

    @Test
    fun `the same content needs no write`() {
        assertFalse(ConfigFile.needsWrite("{}", "{}"))
    }

    @Test
    fun `changed content needs a write`() {
        // An IDE upgrade moves the java launcher and the jar, so the compare reads content.
        assertTrue(ConfigFile.needsWrite("{\"a\":1}", "{\"a\":2}"))
    }
}
