package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Drives the PATH search with an environment of plain text.
 *
 * Every wanted file comes from [Path.of] on both sides of an assertion, so the test reads
 * the same on a machine that divides a path with a slash and on one that uses a backslash.
 */
class PathLookupTest {

    private val command = "claude"

    private fun only(vararg wanted: Path): (Path) -> Boolean = { it in wanted }

    @Test
    fun `the first folder of the PATH answers`() {
        val first = Path.of("/opt/bin", command)

        assertEquals(
            first,
            PathLookup.find(
                command = command,
                path = "/opt/bin:/usr/bin",
                separator = ':',
                windows = false,
                pathExt = null,
                runnable = only(first, Path.of("/usr/bin", command)),
            ),
        )
    }

    @Test
    fun `a later folder answers when the earlier folders hold nothing`() {
        val third = Path.of("/home/dev/.local/bin", command)

        assertEquals(
            third,
            PathLookup.find(
                command = command,
                path = "/opt/bin:/usr/bin:/home/dev/.local/bin",
                separator = ':',
                windows = false,
                pathExt = null,
                runnable = only(third),
            ),
        )
    }

    @Test
    fun `a PATH that holds no such command answers nothing`() {
        assertNull(
            PathLookup.find(
                command = command,
                path = "/opt/bin:/usr/bin",
                separator = ':',
                windows = false,
                pathExt = null,
                runnable = { false },
            ),
        )
    }

    @Test
    fun `an empty PATH answers nothing`() {
        listOf(null, "", ":", "  ").forEach { path ->
            assertNull(
                PathLookup.find(
                    command = command,
                    path = path,
                    separator = ':',
                    windows = false,
                    pathExt = null,
                    runnable = { true },
                ),
                "a PATH of $path names no folder",
            )
        }
    }

    @Test
    fun `Windows finds a file that only PATHEXT names`() {
        val wanted = Path.of("C:\\tools", "claude.CMD")

        assertEquals(
            wanted,
            PathLookup.find(
                command = command,
                path = "C:\\windows;C:\\tools",
                separator = ';',
                windows = true,
                pathExt = ".COM;.EXE;.BAT;.CMD",
                runnable = only(wanted, Path.of("C:\\tools", command)),
            ),
        )
    }

    @Test
    fun `an empty PATHEXT falls back to the default extensions`() {
        val wanted = Path.of("C:\\tools", "claude.EXE")

        assertEquals(listOf(".COM", ".EXE", ".BAT", ".CMD"), PathLookup.extensions(""))
        assertEquals(PathLookup.DEFAULT_EXTENSIONS, PathLookup.extensions(null))
        assertEquals(
            wanted,
            PathLookup.find(
                command = command,
                path = "C:\\tools",
                separator = ';',
                windows = true,
                pathExt = null,
                runnable = only(wanted),
            ),
        )
    }

    @Test
    fun `an extension without a point still names a file`() {
        assertEquals(listOf(".EXE", ".CMD"), PathLookup.extensions("EXE; .CMD ;"))
    }

    @Test
    fun `the folder list drops an empty entry and trims the rest`() {
        assertEquals(listOf("/opt/bin", "/usr/bin"), PathLookup.entries("/opt/bin: :/usr/bin:", ':'))
        assertEquals(emptyList(), PathLookup.entries(null, ':'))
    }

    @Test
    fun `only Windows adds an extension to the command`() {
        assertEquals(listOf(command), PathLookup.names(command, windows = false, pathExt = ".EXE"))
        assertEquals(
            listOf("claude.EXE", "claude.CMD"),
            PathLookup.names(command, windows = true, pathExt = ".EXE;.CMD"),
        )
    }

    @Test
    fun `a folder that no path can carry drops out of the search`() {
        val wanted = Path.of("/usr/bin", command)

        assertEquals(
            wanted,
            PathLookup.find(
                command = command,
                path = "/opt\u0000bin:/usr/bin",
                separator = ':',
                windows = false,
                pathExt = null,
                runnable = only(wanted),
            ),
        )
    }
}
