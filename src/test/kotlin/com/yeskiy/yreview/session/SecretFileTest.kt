package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.SessionKey
import java.nio.file.Files
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermissions
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SecretFileTest {

    private val value = "3f8a1c07d95b2e46"

    private fun <T> withHome(body: (java.nio.file.Path) -> T): T {
        val home = Files.createTempDirectory("y-review-home")
        try {
            return body(home)
        } finally {
            home.toFile().deleteRecursively()
        }
    }

    @Test
    fun `the shell finds the value the plugin wrote`() {
        withHome { home ->
            val file = SecretFile.forSession(SessionKey.newKey(), home)

            file.write(value)

            assertEquals(value, file.path.readText())
        }
    }

    @Test
    fun `the file stands under the folder of the plugin in the user profile`() {
        withHome { home ->
            val file = SecretFile.forSession("a1b2c3d4", home)

            assertEquals(home.resolve(".y-review").resolve("secret").resolve("a1b2c3d4.txt"), file.path)
        }
    }

    @Test
    fun `a key that names a parent folder still names a file inside the folder`() {
        withHome { home ->
            val file = SecretFile.forSession("../../escape", home)

            file.write(value)

            assertEquals(home.resolve(".y-review").resolve("secret"), file.path.parent)
            assertEquals("------escape.txt", file.path.fileName.toString())
        }
    }

    @Test
    fun `a delete takes the value off the disk`() {
        withHome { home ->
            val file = SecretFile.forSession("a1b2c3d4", home)
            file.write(value)

            file.delete()

            assertFalse(file.path.exists())
        }
    }

    @Test
    fun `a delete of a file that is already gone is quiet`() {
        withHome { home ->
            SecretFile.forSession("a1b2c3d4", home).delete()
        }
    }

    @Test
    fun `a new value replaces the old one`() {
        withHome { home ->
            val file = SecretFile.forSession("a1b2c3d4", home)
            file.write(value)

            file.write("0000111122223333")

            assertEquals("0000111122223333", file.path.readText())
        }
    }

    @Test
    fun `no other user of the machine can read the file`() {
        withHome { home ->
            val file = SecretFile.forSession("a1b2c3d4", home)
            file.write(value)
            val view = Files.getFileAttributeView(file.path, PosixFileAttributeView::class.java)
                ?: return@withHome

            assertEquals(
                PosixFilePermissions.fromString("rw-------"),
                view.readAttributes().permissions(),
            )
        }
    }

    @Test
    fun `the folder holds one file for each session`() {
        withHome { home ->
            SecretFile.forSession("aaaa1111", home).write(value)
            SecretFile.forSession("bbbb2222", home).write(value)

            assertTrue(
                Files.list(home.resolve(".y-review").resolve("secret")).use { it.count() } == 2L,
                "two sessions must keep two files",
            )
        }
    }
}
