package com.yeskiy.yreview.bridge

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class DiscoveryFileTest {

    private fun withHome(body: (Path) -> Unit) {
        val home = Files.createTempDirectory("y-review-home")
        try {
            body(home)
        } finally {
            home.toFile().deleteRecursively()
        }
    }

    private val entry = BridgeEntry(
        url = "http://127.0.0.1:52431",
        token = "9f2c000000000000",
        projectPath = "E:/work/demo-repo",
        pid = 1234,
    )

    @Test
    fun `keeps a readable part of the path and adds the hash of the path`() {
        assertEquals("E--work-demo-repo-89e68f21e4cdb121.json", DiscoveryFile.fileName("E:/work/demo-repo"))
    }

    @Test
    fun `hashes the path with the slashes of the backslash spelling`() {
        assertEquals("C--work-app2-1ccc5d63b732c6b3.json", DiscoveryFile.fileName("C:\\work\\app2"))
    }

    @Test
    fun `two paths that differ in one character that is not a letter get two names`() {
        assertNotEquals(
            DiscoveryFile.fileName("E:/work/my-repo"),
            DiscoveryFile.fileName("E:/work/my_repo"),
        )
    }

    @Test
    fun `two spellings of one path get one name`() {
        assertEquals(
            DiscoveryFile.fileName("E:/work/repo"),
            DiscoveryFile.fileName("E:\\work\\repo"),
        )
    }

    @Test
    fun `a deep path gives a name that every file system accepts`() {
        val deep = "E:/" + (1..40).joinToString("/") { "folder-name-number-$it" }
        assertTrue(deep.length > 200)
        assertEquals(80, DiscoveryFile.fileName(deep).length)
    }

    @Test
    fun `puts the file in the bridge folder of the user profile`() {
        withHome { home ->
            assertEquals(
                home.resolve(".y-review").resolve("bridge").resolve("E--code-701ba83e04c904c1.json"),
                DiscoveryFile.forProject("E:/code", home).path,
            )
        }
    }

    @Test
    fun `writes the four fields the session reads`() {
        withHome { home ->
            val file = DiscoveryFile.forProject(entry.projectPath, home)
            file.write(entry)
            assertEquals(
                """{"url":"http://127.0.0.1:52431","token":"9f2c000000000000",""" +
                    """"projectPath":"E:/work/demo-repo","pid":1234}""",
                file.path.readText(),
            )
        }
    }

    @Test
    fun `makes the folder when it is missing`() {
        withHome { home ->
            DiscoveryFile.forProject(entry.projectPath, home).write(entry)
            assertTrue(Files.isDirectory(home.resolve(".y-review").resolve("bridge")))
        }
    }

    @Test
    fun `replaces the file of an earlier run`() {
        withHome { home ->
            val file = DiscoveryFile.forProject(entry.projectPath, home)
            file.write(entry)
            file.write(entry.copy(url = "http://127.0.0.1:1234"))
            assertTrue(file.path.readText().contains("127.0.0.1:1234"))
            assertFalse(file.path.readText().contains("52431"))
        }
    }

    @Test
    fun `deletes the file`() {
        withHome { home ->
            val file = DiscoveryFile.forProject(entry.projectPath, home)
            file.write(entry)
            file.delete()
            assertFalse(Files.exists(file.path))
        }
    }

    @Test
    fun `deletes a file that is already gone`() {
        withHome { home ->
            DiscoveryFile.forProject(entry.projectPath, home).delete()
        }
    }

    @Test
    fun `leaves no other file behind`() {
        withHome { home ->
            val file = DiscoveryFile.forProject(entry.projectPath, home)
            file.write(entry)
            file.delete()
            assertEquals(0, file.path.parent.toFile().listFiles()?.size)
        }
    }
}
