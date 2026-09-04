package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgentSearchTest {

    private val folders = listOf(Path.of("/home/dev/.local/bin"), Path.of("/opt/homebrew/bin"))

    private val claude = AgentCatalog.of(AgentId.CLAUDE)

    private val cursor = AgentCatalog.of(AgentId.CURSOR)

    private fun one(
        path: String? = null,
        exists: (Path) -> Boolean = { false },
        runnable: (Path) -> Boolean = { false },
        spec: AgentSpec = claude,
        windows: Boolean = false,
    ) = AgentSearch.one(spec, path, null, windows, folders, runnable, exists)

    @Test
    fun `an empty machine reports nothing`() {
        val install = one()

        assertFalse(install.found)
        assertEquals(AgentInstall.NOTHING, install)
        assertEquals(AgentSource.NONE, install.source)
    }

    @Test
    fun `the PATH answer wins over a folder`() {
        val install = one(path = "/usr/bin", runnable = { true }, exists = { true })

        assertTrue(install.found)
        assertEquals(AgentSource.PATH, install.source)
        assertEquals(Path.of("/usr/bin/claude").toAbsolutePath().toString(), install.path)
    }

    @Test
    fun `a folder answers when the PATH holds nothing`() {
        val wanted = Path.of("/opt/homebrew/bin/claude")

        val install = one(exists = { it == wanted })

        assertTrue(install.found)
        assertEquals(AgentSource.FOLDER, install.source)
        assertEquals(wanted.toString(), install.path)
    }

    @Test
    fun `windows looks for a shim with an extension`() {
        // PATHEXT names its entries in upper case, so the search builds codex.CMD.
        val volta = Path.of("C:/Volta/bin/codex.CMD")

        val install = AgentSearch.one(
            AgentCatalog.of(AgentId.CODEX),
            null,
            ".COM;.EXE;.CMD",
            windows = true,
            folders = listOf(Path.of("C:/Volta/bin")),
            runnable = { false },
            exists = { it == volta },
        )

        assertTrue(install.found)
        assertEquals(AgentSource.FOLDER, install.source)
        assertEquals(volta.toString(), install.path)
    }

    @Test
    fun `the second name of an agent still answers`() {
        val wanted = Path.of("/home/dev/.local/bin/agent")

        val install = one(spec = cursor, exists = { it == wanted })

        assertTrue(install.found)
        assertEquals(wanted.toString(), install.path)
    }

    @Test
    fun `an agent that names no command is never found`() {
        val install = one(spec = AgentCatalog.of(AgentId.CUSTOM), runnable = { true }, exists = { true })

        assertFalse(install.found)
    }

    @Test
    fun `one scan answers for every agent of the catalog`() {
        val answers = AgentSearch.all(AgentCatalog.ALL, null, null, false, folders, { false }, { false })

        assertEquals(AgentId.entries.toSet(), answers.keys)
        assertTrue(answers.values.none { it.found })
    }

    @Test
    fun `a scan that found two agents names them`() {
        val wanted = setOf(Path.of("/opt/homebrew/bin/claude"), Path.of("/opt/homebrew/bin/opencode"))

        val answers = AgentSearch.all(AgentCatalog.ALL, null, null, false, folders, { false }) { it in wanted }

        assertEquals(setOf(AgentId.CLAUDE, AgentId.OPENCODE), answers.filterValues { it.found }.keys)
    }
}
