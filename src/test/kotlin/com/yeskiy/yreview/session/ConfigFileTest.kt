package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ConfigFileTest {

    private val home: Path = Path.of("E:", "home")

    @Test
    fun `the file stands in the mcp folder of the plugin root`() {
        assertEquals(
            home.resolve(".y-review").resolve("mcp").resolve("claude.json"),
            ConfigFile.path(home, AgentId.CLAUDE),
        )
    }

    @Test
    fun `two sessions of one agent name the same file`() {
        assertEquals(ConfigFile.path(home, AgentId.CLAUDE), ConfigFile.path(home, AgentId.CLAUDE))
    }

    @Test
    fun `two agents name two files`() {
        assertEquals(
            AgentId.entries.size,
            AgentId.entries.map { ConfigFile.fileName(it) }.toSet().size,
        )
    }

    @Test
    fun `the file name holds the agent and the json suffix`() {
        assertEquals("opencode.json", ConfigFile.fileName(AgentId.OPENCODE))
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
