package com.yeskiy.yreview.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermissions
import java.security.MessageDigest

/** The values a session needs to reach the bridge of one project. */
@Serializable
data class BridgeEntry(
    val url: String,
    val token: String,
    val projectPath: String,
    val pid: Long,
)

/**
 * The file a session reads to find the bridge of a project.
 *
 * The file holds a bearer token, so it lives under the user profile and never inside a
 * repository. The name comes from the project path, because a session knows its working
 * directory and nothing else about the IDE.
 */
class DiscoveryFile(val path: Path) {

    fun write(entry: BridgeEntry) {
        Files.createDirectories(path.parent)
        val temporary = Files.createTempFile(path.parent, "bridge", ".tmp")
        ownerOnly(temporary)
        Files.writeString(temporary, json.encodeToString(BridgeEntry.serializer(), entry))
        move(temporary)
    }

    fun delete() {
        Files.deleteIfExists(path)
    }

    private fun move(temporary: Path) {
        try {
            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (unsupported: IOException) {
            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING)
        }
    }

    /**
     * Asks for owner only rights where the file system knows them. Windows has no POSIX
     * rights, and there the user profile folder already keeps the file private.
     */
    private fun ownerOnly(file: Path) {
        val view = Files.getFileAttributeView(file, PosixFileAttributeView::class.java) ?: return
        runCatching { view.setPermissions(PosixFilePermissions.fromString("rw-------")) }
    }

    companion object {
        private val json = Json { prettyPrint = false }

        private val NOT_ALPHANUMERIC = Regex("[^A-Za-z0-9]")

        /** The name keeps this many characters of the path for a person to read. */
        private const val READABLE_LENGTH = 58

        /** Eight bytes of the hash give sixteen hexadecimal characters. */
        private const val HASH_BYTES = 8

        /**
         * Builds the name of the discovery file of one project.
         *
         * A backslash becomes a slash first, so one project keeps one name in both
         * spellings of its path. The end of the path stays readable, because a person
         * finds the project by the name of its folder. The hash reads the whole path
         * before the plugin replaces any character. Two projects that differ only in a
         * hyphen or an underscore therefore get two names. The name stays inside 80
         * characters, and every file system accepts that length.
         */
        fun fileName(projectPath: String): String {
            val path = projectPath.replace('\\', '/')
            return NOT_ALPHANUMERIC.replace(path, "-").takeLast(READABLE_LENGTH) +
                "-" + hashOf(path) + ".json"
        }

        private fun hashOf(path: String): String =
            MessageDigest.getInstance("SHA-256")
                .digest(path.toByteArray(Charsets.UTF_8))
                .take(HASH_BYTES)
                .joinToString("") { "%02x".format(it) }

        fun forProject(
            projectPath: String,
            home: Path = Path.of(System.getProperty("user.home")),
        ): DiscoveryFile = DiscoveryFile(home.resolve(".y-review").resolve("bridge").resolve(fileName(projectPath)))
    }
}
