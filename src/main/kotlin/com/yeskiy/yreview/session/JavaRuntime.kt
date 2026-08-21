package com.yeskiy.yreview.session

import java.nio.file.Files
import java.nio.file.Path

/**
 * Finds the Java runtime that runs this IDE.
 *
 * The channel server is a jar, and every IDE ships a Java runtime. The plugin therefore
 * asks for no other install on the machine.
 *
 * The answer comes from the java.home property, and not from the command of the current
 * process. The IDE loads the runtime inside its own process from a library, so the command
 * of the process names the launcher of the IDE.
 */
object JavaRuntime {

    const val HOME_PROPERTY = "java.home"

    /** The names a bin folder can hold. Windows adds an extension to the command. */
    val FILE_NAMES = listOf("java.exe", "java")

    fun candidates(home: String?): List<Path> =
        home?.let { root -> FILE_NAMES.map { Path.of(root, "bin", it) } }.orEmpty()

    /** Null when the folder holds no launcher, so the session then carries no channel. */
    fun of(files: List<Path>, exists: (Path) -> Boolean): String? = files.firstOrNull(exists)?.toString()

    fun locate(
        home: String? = System.getProperty(HOME_PROPERTY),
        exists: (Path) -> Boolean = { Files.isRegularFile(it) },
    ): String? = of(candidates(home), exists)
}
