package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ClaudeSearchTest {

    private val home = "/home/dev"

    private val appData = "/roaming"

    @Test
    fun `an empty machine reports nothing`() {
        val install = ClaudeSearch.of(onPath = null, files = emptyList(), exists = { false })

        assertFalse(install.found)
        assertEquals(null, install.path)
        assertEquals(ClaudeSource.NONE, install.source)
        assertEquals(ClaudeInstall.NOTHING, install)
    }

    @Test
    fun `the PATH answer wins`() {
        val install = ClaudeSearch.of(
            onPath = "/usr/bin/claude",
            files = ClaudeSearch.candidates(home, appData),
            exists = { true },
        )

        assertTrue(install.found)
        assertEquals("/usr/bin/claude", install.path)
        assertEquals(ClaudeSource.PATH, install.source)
    }

    @Test
    fun `a folder answers when the PATH holds nothing`() {
        val wanted = Path.of(home, ".local", "bin", "claude.exe")

        val install = ClaudeSearch.of(
            onPath = null,
            files = ClaudeSearch.candidates(home, appData),
            exists = { it == wanted },
        )

        assertTrue(install.found)
        assertEquals(wanted.toString(), install.path)
        assertEquals(ClaudeSource.FOLDER, install.source)
    }

    @Test
    fun `the global npm folder answers too`() {
        val wanted = Path.of(appData, "npm", "claude.cmd")

        val install = ClaudeSearch.of(
            onPath = null,
            files = ClaudeSearch.candidates(home, appData),
            exists = { it == wanted },
        )

        assertEquals(wanted.toString(), install.path)
        assertEquals(ClaudeSource.FOLDER, install.source)
    }

    @Test
    fun `names the two well known folders`() {
        assertEquals(
            listOf(Path.of(home, ".local", "bin"), Path.of(appData, "npm")),
            ClaudeSearch.folders(home, appData),
        )
    }

    @Test
    fun `a missing environment variable drops its folder`() {
        assertEquals(listOf(Path.of(home, ".local", "bin")), ClaudeSearch.folders(home, null))
        assertEquals(emptyList(), ClaudeSearch.folders(null, null))
        assertEquals(emptyList(), ClaudeSearch.candidates(null, null))
    }

    @Test
    fun `every folder carries every file name`() {
        assertEquals(listOf("claude", "claude.exe", "claude.cmd", "claude.bat"), ClaudeSearch.FILE_NAMES)
        assertEquals("claude", ClaudeSearch.COMMAND)
        assertEquals(8, ClaudeSearch.candidates(home, appData).size)
    }
}
