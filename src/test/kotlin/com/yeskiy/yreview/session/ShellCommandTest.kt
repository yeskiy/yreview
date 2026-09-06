package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.OpenCodeClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShellCommandTest {

    private val project = "E:/work/demo-repo"

    private val config = "C:\\Users\\dev\\AppData\\Local\\Temp\\y-review-mcp-1.json"

    private val secretPath = "C:/Users/dev/.y-review/secret/a1b2.txt"

    private val secret = SecretVariable(OpenCodeClient.PASSWORD_VARIABLE, secretPath)

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
    fun `windows converts the working directory of a session`() {
        assertEquals(project, ShellCommand.workingDirectory("/mnt/e/work/demo-repo", windows = true))
    }

    @Test
    fun `another system keeps the working directory as it stands`() {
        // A folder named /mnt/e is an ordinary folder on Linux, and the session starts there.
        assertEquals(
            "/mnt/e/work/demo-repo",
            ShellCommand.workingDirectory("/mnt/e/work/demo-repo", windows = false),
        )
        assertEquals("/home/dev/a\\b", ShellCommand.workingDirectory("/home/dev/a\\b", windows = false))
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
    fun `the windows line reads the password from the file and removes that file`() {
        assertEquals(
            "\$env:OPENCODE_SERVER_PASSWORD = (Get-Content -LiteralPath '$secretPath'); " +
                "Remove-Item -LiteralPath '$secretPath' -Force; " +
                "if ([string]::IsNullOrEmpty(\$env:OPENCODE_SERVER_PASSWORD)) " +
                "{ Write-Error '${ShellCommand.NO_SECRET}'; exit 1 }; " +
                "& 'opencode' '--port' '52431'",
            ShellCommand.shellLine(listOf("opencode", "--port", "52431"), secret, windows = true),
        )
    }

    @Test
    fun `the posix line reads the password from the file and removes that file`() {
        assertEquals(
            "OPENCODE_SERVER_PASSWORD=\"\$(cat '$secretPath' && rm -f '$secretPath')\"; " +
                "if [ -z \"\$OPENCODE_SERVER_PASSWORD\" ]; " +
                "then echo '${ShellCommand.NO_SECRET}' >&2; exit 1; fi; " +
                "export OPENCODE_SERVER_PASSWORD; " +
                "'opencode' '--port' '52431'",
            ShellCommand.shellLine(listOf("opencode", "--port", "52431"), secret, windows = false),
        )
    }

    @Test
    fun `the windows line stops before the agent when the file gives nothing`() {
        // An empty password opens an OpenCode server that answers every local request.
        val line = ShellCommand.shellLine(listOf("opencode"), secret, windows = true)

        assertTrue(line.contains("if ([string]::IsNullOrEmpty(\$env:OPENCODE_SERVER_PASSWORD))"), line)
        assertTrue(line.indexOf("exit 1") < line.indexOf("& 'opencode'"), line)
    }

    @Test
    fun `the posix line stops before the agent when the file gives nothing`() {
        val line = ShellCommand.shellLine(listOf("opencode"), secret, windows = false)

        assertTrue(line.contains("if [ -z \"\$OPENCODE_SERVER_PASSWORD\" ]"), line)
        assertTrue(line.indexOf("exit 1") < line.indexOf("'opencode'"), line)
    }

    @Test
    fun `the wrapper of both systems carries the read of the password`() {
        assertTrue(
            ShellCommand.shellCommand(listOf("opencode"), secret, windows = true)
                .last().startsWith("\$env:OPENCODE_SERVER_PASSWORD = (Get-Content"),
        )
        assertTrue(
            ShellCommand.shellCommand(listOf("opencode"), secret, windows = false, shell = "/bin/sh")
                .last().startsWith("OPENCODE_SERVER_PASSWORD=\"\$(cat"),
        )
    }

    @Test
    fun `a line without a password keeps the shape it always had`() {
        assertEquals("& 'opencode'", ShellCommand.shellLine(listOf("opencode"), windows = true))
        assertEquals("'opencode'", ShellCommand.shellLine(listOf("opencode"), windows = false))
    }

    @Test
    fun `a single quote in the path of the password stays inside the literal`() {
        // The line takes the quoting rule of its own shell, and never a rule of its own.
        val quoted = SecretVariable("P", "/home/o'brien/p.txt")

        assertTrue(
            ShellCommand.shellLine(listOf("opencode"), quoted, windows = true)
                .startsWith("\$env:P = (Get-Content -LiteralPath '/home/o''brien/p.txt'); "),
        )
        assertTrue(
            ShellCommand.shellLine(listOf("opencode"), quoted, windows = false)
                .startsWith("P=\"\$(cat '/home/o'\\''brien/p.txt' && rm -f '/home/o'\\''brien/p.txt')\"; "),
        )
    }

    @Test
    fun `the fallback shell answers when the environment names none`() {
        assertEquals("/bin/sh", ShellCommand.FALLBACK_SHELL)
        assertTrue(ShellCommand.loginShell().isNotBlank())
    }
}
