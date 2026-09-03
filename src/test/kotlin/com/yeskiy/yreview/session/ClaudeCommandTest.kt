package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ClaudeCommandTest {

    private val project = "E:/work/demo-repo"

    private val config = "C:\\Users\\dev\\AppData\\Local\\Temp\\claude-y-review-mcp-1.json"

    @Test
    fun `a windows path keeps its drive letter and loses its backslashes`() {
        assertEquals(project, ClaudeCommand.windowsPath("E:\\work\\demo-repo"))
    }

    @Test
    fun `a wsl path becomes a windows path`() {
        assertEquals(project, ClaudeCommand.windowsPath("/mnt/e/work/demo-repo"))
    }

    @Test
    fun `a trailing separator is dropped`() {
        assertEquals(project, ClaudeCommand.windowsPath("E:/work/demo-repo/"))
    }

    @Test
    fun `a drive root keeps its separator`() {
        assertEquals("E:/", ClaudeCommand.windowsPath("E:\\"))
    }

    @Test
    fun `the default command is the launcher every installer writes to the path`() {
        assertEquals("claude", ClaudeCommand.DEFAULT_COMMAND)
    }

    @Test
    fun `without a configuration file the session runs the command alone`() {
        assertEquals(listOf("claude"), ClaudeCommand.arguments("claude"))
    }

    @Test
    fun `the plugin appends the two flags of the channel`() {
        assertEquals(
            listOf(
                "claude",
                "--mcp-config",
                config,
                "--dangerously-load-development-channels",
                "server:y-review",
            ),
            ClaudeCommand.arguments("claude", config),
        )
    }

    @Test
    fun `the flags read exactly as the settings page shows them`() {
        assertEquals("--mcp-config", ClaudeCommand.CONFIG_FLAG)
        assertEquals("--dangerously-load-development-channels", ClaudeCommand.CHANNEL_FLAG)
        assertEquals("server:y-review", ClaudeCommand.CHANNEL_VALUE)
        assertEquals("y-review", ClaudeCommand.SERVER_NAME)
    }

    @Test
    fun `windows runs powershell with the profile of the user`() {
        assertEquals(
            listOf("powershell.exe", "-NoLogo", "-Command", "& 'claude'"),
            ClaudeCommand.shellCommand("claude", windows = true),
        )
    }

    @Test
    fun `a system that is not windows runs a login shell`() {
        assertEquals(
            listOf("/bin/zsh", "-l", "-c", "'claude'"),
            ClaudeCommand.shellCommand("claude", windows = false, shell = "/bin/zsh"),
        )
    }

    @Test
    fun `the windows line quotes every part of the command`() {
        assertEquals(
            "& 'claude' '--mcp-config' '$config' " +
                "'--dangerously-load-development-channels' 'server:y-review'",
            ClaudeCommand.shellLine("claude", config, windows = true),
        )
    }

    @Test
    fun `the posix line quotes every part of the command`() {
        assertEquals(
            "'claude' '--mcp-config' '/tmp/mcp.json' " +
                "'--dangerously-load-development-channels' 'server:y-review'",
            ClaudeCommand.shellLine("claude", "/tmp/mcp.json", windows = false),
        )
    }

    @Test
    fun `a command with a space stays one command`() {
        assertEquals(
            "& 'C:\\Program Files\\claude\\claude.exe'",
            ClaudeCommand.shellLine("C:\\Program Files\\claude\\claude.exe", windows = true),
        )
    }

    @Test
    fun `powershell takes two single quotes for one`() {
        assertEquals("& 'a''b'", ClaudeCommand.shellLine("a'b", windows = true))
    }

    @Test
    fun `a posix shell closes and opens the literal around a single quote`() {
        assertEquals("'a'\\''b'", ClaudeCommand.shellLine("a'b", windows = false))
    }

    @Test
    fun `no wrapper outlives the agent`() {
        // A flag such as -NoExit keeps the shell alive after the agent exits. The terminal
        // session then stays open, and the tool window reports a session that nobody uses.
        assertFalse(ClaudeCommand.shellCommand("claude", windows = true).contains("-NoExit"))
        assertFalse(ClaudeCommand.shellCommand("claude", windows = false, shell = "/bin/sh").contains("-i"))
    }

    @Test
    fun `powershell keeps the profile of the user`() {
        // Without the profile a command that is a shell function never resolves.
        assertFalse(ClaudeCommand.shellCommand("claude", windows = true).contains("-NoProfile"))
    }

    @Test
    fun `the command never names a bridge variable`() {
        val text = ClaudeCommand.shellCommand("claude", config, windows = true).joinToString(" ")
        assertFalse(text.contains("Y_REVIEW_BRIDGE"))
    }

    @Test
    fun `the fallback shell answers when the environment names none`() {
        assertEquals("/bin/sh", ClaudeCommand.FALLBACK_SHELL)
        assertTrue(ClaudeCommand.loginShell().isNotBlank())
    }
}
