package com.yeskiy.yreview.bridge

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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
        projectPath = "E:/work/demo",
        pid = 1234,
    )

    @Test
    fun `replaces every character that is not a letter or a digit`() {
        assertEquals("E--Projects-Opened-y-review.json", DiscoveryFile.fileName("E:/work/demo"))
    }

    @Test
    fun `keeps the letters and the digits of the path`() {
        assertEquals("C--work-app2.json", DiscoveryFile.fileName("C:\\work\\app2"))
    }

    @Test
    fun `puts the file in the bridge folder of the user profile`() {
        withHome { home ->
            assertEquals(
                home.resolve(".y-review").resolve("bridge").resolve("E--code.json"),
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
                    """"projectPath":"E:/work/demo","pid":1234}""",
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
