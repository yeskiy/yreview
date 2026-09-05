package com.yeskiy.yreview.session

import com.yeskiy.yreview.store.FolderStore
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermissions

/**
 * The file that carries one secret of a session from the plugin to the shell of that
 * session.
 *
 * The platform writes the environment and the command line of a terminal into the log of
 * the IDE. A value in either one reaches a file that a user attaches to a public bug
 * report. The shell therefore reads the value from this file, and the same line removes
 * the file. A path in a log tells a reader nothing that the value would tell.
 *
 * The file stands under the user profile, beside the bridge folder, and never inside a
 * repository. One session owns one file, and the name comes from the key of that session.
 */
class SecretFile(val path: Path) {

    /**
     * Puts [value] in place for one session.
     *
     * The value goes into a new file first. That file already holds the rights of the
     * owner alone, so the value never stands in a file that another user can read.
     */
    fun write(value: String) {
        Files.createDirectories(path.parent)
        val temporary = Files.createTempFile(path.parent, "secret", TEMPORARY_SUFFIX)
        ownerOnly(temporary)
        Files.writeString(temporary, value)
        move(temporary)
    }

    /** A file that is already gone is no failure. The shell removes it after the read. */
    fun delete() {
        Files.deleteIfExists(path)
    }

    /**
     * The same move that [com.yeskiy.yreview.bridge.DiscoveryFile] makes. A shell that
     * reads the file while the plugin writes it never sees half a value.
     */
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

        /** The folder that holds one file for each session that carries a secret. */
        const val FOLDER = "secret"

        const val SUFFIX = ".txt"

        private const val TEMPORARY_SUFFIX = ".tmp"

        private val NOT_ALPHANUMERIC = Regex("[^A-Za-z0-9]")

        /**
         * The name of the file of one session.
         *
         * Every character that is not a letter and not a digit becomes a hyphen. A key
         * therefore names a file inside the folder and never outside it.
         */
        fun fileName(sessionKey: String): String = NOT_ALPHANUMERIC.replace(sessionKey, "-") + SUFFIX

        fun forSession(
            sessionKey: String,
            home: Path = BridgeDiscovery.homeDirectory(),
        ): SecretFile = SecretFile(home.resolve(FolderStore.FOLDER).resolve(FOLDER).resolve(fileName(sessionKey)))
    }
}
