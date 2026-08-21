package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NodeSearchTest {

    private val onPath = "C:\\Program Files\\nodejs\\node.exe"

    private val never: (Path) -> Boolean = { false }

    @Test
    fun `the path beats every folder`() {
        val install = NodeSearch.of(onPath, NodeSearch.candidates("C:\\Program Files"), { true })

        assertEquals(onPath, install.path)
        assertTrue(install.found)
    }

    @Test
    fun `a folder answers when the path holds no node`() {
        val file = Path.of("C:\\Program Files", "nodejs", "node.exe")

        assertEquals(file.toString(), NodeSearch.of(null, listOf(file), { it == file }).path)
    }

    @Test
    fun `nothing is found when no path and no folder holds node`() {
        val install = NodeSearch.of(null, NodeSearch.candidates("C:\\Program Files"), never)

        assertEquals(NodeInstall.NOTHING, install)
        assertFalse(install.found)
    }

    @Test
    fun `the search knows the folder of the windows installer`() {
        val folders = NodeSearch.folders("C:\\Program Files")

        assertTrue(folders.contains(Path.of("C:\\Program Files", "nodejs")), folders.toString())
    }

    @Test
    fun `the search knows the two folders of a posix installer`() {
        val folders = NodeSearch.folders(null)

        assertTrue(folders.contains(Path.of("/usr/local/bin")), folders.toString())
        assertTrue(folders.contains(Path.of("/opt/homebrew/bin")), folders.toString())
    }

    @Test
    fun `every folder is asked for both file names`() {
        val candidates = NodeSearch.candidates("C:\\Program Files")

        assertEquals(NodeSearch.folders("C:\\Program Files").size * 2, candidates.size)
        assertTrue(candidates.any { it.fileName.toString() == "node.exe" })
        assertTrue(candidates.any { it.fileName.toString() == "node" })
    }

    @Test
    fun `the command is the one every installer writes to the path`() {
        assertEquals("node", NodeSearch.COMMAND)
    }
}
