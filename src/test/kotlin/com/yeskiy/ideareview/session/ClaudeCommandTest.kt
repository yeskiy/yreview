package com.yeskiy.ideareview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ClaudeCommandTest {

    private val project = "E:/work/demo"

    @Test
    fun `the mcp config pins the project in the header`() {
        assertEquals(
            "{\"mcpServers\":{\"idea\":{\"type\":\"http\",\"url\":\"http://127.0.0.1:64342/stream\"," +
                "\"headers\":{\"IJ_MCP_SERVER_PROJECT_PATH\":\"E:/work/demo\"}}}}",
            ClaudeCommand.mcpConfig(project)
        )
    }

    @Test
    fun `a windows path keeps its drive letter and loses its backslashes`() {
        assertEquals(project, ClaudeCommand.windowsPath("E:\\Projects\\Opened\\idea-review"))
    }

    @Test
    fun `a wsl path becomes a windows path`() {
        assertEquals(project, ClaudeCommand.windowsPath("/mnt/e/Projects/Opened/idea-review"))
    }

    @Test
    fun `a trailing separator is dropped`() {
        assertEquals(project, ClaudeCommand.windowsPath("E:/work/demo/"))
    }

    @Test
    fun `a drive root keeps its separator`() {
        assertEquals("E:/", ClaudeCommand.windowsPath("E:\\"))
    }

    @Test
    fun `the arguments carry the launcher the config and the channel`() {
        assertEquals(
            listOf(
                "claude",
                "--mcp-config",
                ClaudeCommand.mcpConfig(project),
                "--dangerously-load-development-channels",
                "server:idea-review"
            ),
            ClaudeCommand.arguments(project)
        )
    }

    @Test
    fun `the shell line quotes the config for powershell`() {
        assertEquals(
            "claude --mcp-config '" + ClaudeCommand.mcpConfig(project) + "' " +
                "--dangerously-load-development-channels 'server:idea-review'",
            ClaudeCommand.shellLine(project)
        )
    }

    @Test
    fun `a single quote in the path is doubled`() {
        val line = ClaudeCommand.shellLine("E:/Projects/O'Brien")
        assertTrue(line.contains("E:/Projects/O''Brien"))
        assertFalse(line.contains("O'Brien"))
    }

    @Test
    fun `the shell command runs powershell and keeps the window open`() {
        assertEquals(
            listOf("powershell.exe", "-NoLogo", "-NoExit", "-Command", ClaudeCommand.shellLine(project)),
            ClaudeCommand.shellCommand(project)
        )
    }

    @Test
    fun `the command never names a bridge variable`() {
        val text = ClaudeCommand.shellCommand(project).joinToString(" ")
        assertFalse(text.contains("IDEA_REVIEW_BRIDGE"))
    }
}
