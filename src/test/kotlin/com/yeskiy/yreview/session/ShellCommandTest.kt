package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShellCommandTest {

    private val project = "E:/work/demo-repo"

    private val config = "C:\\Users\\dev\\AppData\\Local\\Temp\\y-review-mcp-1.json"

    @Test
    fun `a windows path keeps its drive letter and loses its backslashes`() {
        assertEquals(project, ShellCommand.windowsPath("E:\\work\\demo-repo"))
    }

    @Test
    fun `a wsl path becomes a windows path`() {
        assertEquals(project, ShellCommand.windowsPath("/mnt/e/work/demo-repo"))
    }

    @Test
    fun `a trailing separator is dropped`() {
        assertEquals(project, ShellCommand.windowsPath("E:/work/demo-repo/"))
    }

    @Test
    fun `a drive root keeps its separator`() {
        assertEquals("E:/", ShellCommand.windowsPath("E:\\"))
    }

    @Test
    fun `windows runs powershell with the profile of the user`() {
        val command = ShellCommand.shellCommand(listOf("claude"), windows = true)

        assertEquals(listOf("powershell.exe", "-NoLogo", "-Command", "& 'claude'"), command)
    }

    @Test
    fun `another system runs a login shell`() {
        val command = ShellCommand.shellCommand(listOf("opencode"), windows = false, shell = "/bin/zsh")

        assertEquals(listOf("/bin/zsh", "-l", "-c", "'opencode'"), command)
    }

    @Test
    fun `the windows line quotes every part of the command`() {
        assertEquals(
            "& 'claude' '--mcp-config' '$config' " +
                "'--dangerously-load-development-channels' 'server:y-review'",
            ShellCommand.shellLine(
                listOf(
                    "claude",
                    "--mcp-config",
                    config,
                    "--dangerously-load-development-channels",
                    "server:y-review",
                ),
                windows = true,
            ),
        )
    }

    @Test
    fun `the posix line quotes every part of the command`() {
        assertEquals(
            "'opencode' '--port' '52431'",
            ShellCommand.shellLine(listOf("opencode", "--port", "52431"), windows = false),
        )
    }

    @Test
    fun `a single quote inside an argument stays inside the literal`() {
        assertEquals("& 'it''s'", ShellCommand.shellLine(listOf("it's"), windows = true))
        assertEquals("'it'\\''s'", ShellCommand.shellLine(listOf("it's"), windows = false))
    }

    @Test
    fun `a path with a space reaches the agent whole`() {
        val line = ShellCommand.shellLine(listOf("C:/Program Files/x/claude.exe"), windows = true)

        assertTrue(line.contains("'C:/Program Files/x/claude.exe'"), line)
    }

    @Test
    fun `no wrapper outlives the agent`() {
        // A flag such as -NoExit keeps the shell alive after the agent exits. The terminal
        // session then stays open, and the tool window reports a session that nobody uses.
        assertFalse(ShellCommand.shellCommand(listOf("claude"), windows = true).contains("-NoExit"))
        assertFalse(
            ShellCommand.shellCommand(listOf("claude"), windows = false, shell = "/bin/sh").contains("-i")
        )
    }

    @Test
    fun `powershell keeps the profile of the user`() {
        // Without the profile a command that is a shell function never resolves.
        assertFalse(ShellCommand.shellCommand(listOf("claude"), windows = true).contains("-NoProfile"))
    }

    @Test
    fun `the fallback shell answers when the environment names none`() {
        assertEquals("/bin/sh", ShellCommand.FALLBACK_SHELL)
        assertTrue(ShellCommand.loginShell().isNotBlank())
    }
}
