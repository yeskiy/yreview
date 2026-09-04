package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgentFoldersTest {

    private val windows = Places(
        home = "C:\\Users\\dev",
        appData = "C:\\Users\\dev\\AppData\\Roaming",
        localAppData = "C:\\Users\\dev\\AppData\\Local",
        programData = "C:\\ProgramData",
        dataHome = null,
    )

    private val unix = Places(
        home = "/home/dev",
        appData = null,
        localAppData = null,
        programData = null,
        dataHome = null,
    )

    private fun texts(platform: Platform, places: Places) =
        AgentFolders.of(platform, places).map { it.toString().replace('\\', '/') }

    @Test
    fun `the operating system name decides the platform`() {
        assertEquals(Platform.WINDOWS, AgentFolders.platformOf("Windows 11"))
        assertEquals(Platform.MAC, AgentFolders.platformOf("Mac OS X"))
        assertEquals(Platform.LINUX, AgentFolders.platformOf("Linux"))
        assertEquals(Platform.LINUX, AgentFolders.platformOf(""))
    }

    @Test
    fun `windows holds the two shim folders that this machine really uses`() {
        val folders = texts(Platform.WINDOWS, windows)

        assertTrue(folders.contains("C:/Users/dev/AppData/Local/Volta/bin"), "$folders")
        assertTrue(folders.contains("C:/Users/dev/scoop/shims"), "$folders")
        assertTrue(folders.contains("C:/ProgramData/chocolatey/bin"), "$folders")
        assertTrue(folders.contains("C:/Users/dev/AppData/Local/agy/bin"), "$folders")
        assertTrue(folders.contains("C:/Users/dev/AppData/Roaming/npm"), "$folders")
        assertTrue(folders.contains("C:/Users/dev/.local/bin"), "$folders")
    }

    @Test
    fun `mac holds both homebrew folders`() {
        val folders = texts(Platform.MAC, unix)

        assertTrue(folders.contains("/opt/homebrew/bin"), "$folders")
        assertTrue(folders.contains("/usr/local/bin"), "$folders")
        assertTrue(folders.contains("/home/dev/.local/bin"), "$folders")
    }

    @Test
    fun `linux holds the snap and the flatpak wrappers`() {
        val folders = texts(Platform.LINUX, unix)

        assertTrue(folders.contains("/snap/bin"), "$folders")
        assertTrue(folders.contains("/var/lib/flatpak/exports/bin"), "$folders")
        assertTrue(folders.contains("/home/dev/.local/share/flatpak/exports/bin"), "$folders")
        assertTrue(folders.contains("/home/dev/.local/share/pnpm"), "$folders")
    }

    @Test
    fun `a named data home replaces the default one on linux`() {
        val folders = texts(Platform.LINUX, unix.copy(dataHome = "/home/dev/share"))

        assertTrue(folders.contains("/home/dev/share/pnpm"), "$folders")
        assertFalse(folders.contains("/home/dev/.local/share/pnpm"), "$folders")
    }

    @Test
    fun `a machine that names no variable gives no broken path`() {
        val empty = Places(null, null, null, null, null)

        assertEquals(emptyList<Path>(), AgentFolders.of(Platform.WINDOWS, empty))
        assertEquals(
            listOf(
                "/usr/local/bin",
                "/home/linuxbrew/.linuxbrew/bin",
                "/snap/bin",
                "/var/lib/flatpak/exports/bin",
            ),
            texts(Platform.LINUX, empty),
        )
        assertEquals(listOf("/opt/homebrew/bin", "/usr/local/bin"), texts(Platform.MAC, empty))
    }

    @Test
    fun `no folder appears twice`() {
        Platform.entries.forEach { platform ->
            val folders = texts(platform, if (platform == Platform.WINDOWS) windows else unix)

            assertEquals(folders.size, folders.toSet().size, "$platform holds a folder twice")
        }
    }
}
