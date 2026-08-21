package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class ClaudeCommandTest {

    private val project = "E:/work/demo"

    @Test
    fun `a windows path keeps its drive letter and loses its backslashes`() {
        assertEquals(project, ClaudeCommand.windowsPath("E:\\Projects\\Opened\\y-review"))
    }

    @Test
    fun `a wsl path becomes a windows path`() {
        assertEquals(project, ClaudeCommand.windowsPath("/mnt/e/Projects/Opened/y-review"))
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
    fun `the session runs the launcher and nothing else`() {
        assertEquals(listOf("claude"), ClaudeCommand.arguments())
    }

    @Test
    fun `the command carries no flag of its own`() {
        // The launcher owns every flag. A second --mcp-config naming the same server would
        // replace the launcher entry and drop its pinned header. A second channel flag would
        // start a channel the launcher had deliberately left out.
        val text = ClaudeCommand.shellCommand().joinToString(" ")
        assertFalse(text.contains("--mcp-config"))
        assertFalse(text.contains("--dangerously-load-development-channels"))
    }

    @Test
    fun `the shell command runs powershell and keeps the window open`() {
        assertEquals(
            listOf("powershell.exe", "-NoLogo", "-NoExit", "-Command", "claude"),
            ClaudeCommand.shellCommand()
        )
    }

    @Test
    fun `the command never names a bridge variable`() {
        val text = ClaudeCommand.shellCommand().joinToString(" ")
        assertFalse(text.contains("Y_REVIEW_BRIDGE"))
    }
}
