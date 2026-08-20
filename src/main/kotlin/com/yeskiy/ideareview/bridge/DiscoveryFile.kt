package com.yeskiy.ideareview.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermissions

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

        /** Every character that is not an ASCII letter or digit becomes a hyphen. */
        fun fileName(projectPath: String): String =
            projectPath.map { if (it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9') it else '-' }
                .joinToString("") + ".json"

        fun forProject(
            projectPath: String,
            home: Path = Path.of(System.getProperty("user.home")),
        ): DiscoveryFile = DiscoveryFile(home.resolve(".idea-review").resolve("bridge").resolve(fileName(projectPath)))
    }
}
