package com.yeskiy.yreview.store

import java.nio.file.Files
import java.nio.file.Path

/** The common git folder of a working tree root, read from the files that git writes. Null when the layout is not plain. */
object GitDirs {

    fun commonDir(root: String): Path? = runCatching {
        if (System.getenv("GIT_DIR") != null || System.getenv("GIT_COMMON_DIR") != null) return null
        val dotGit = Path.of(root, ".git")
        val gitDir = when {
            Files.isDirectory(dotGit) -> dotGit
            Files.isRegularFile(dotGit) -> linked(dotGit) ?: return null
            else -> return null
        }
        val common = gitDir.resolve("commondir").takeIf { Files.isRegularFile(it) }
            ?.let { gitDir.resolve(Files.readString(it).trim()).normalize() } ?: gitDir
        common.takeIf { Files.isDirectory(it.resolve("refs")) && !Files.exists(it.resolve("reftable")) }
    }.getOrNull()

    /** A linked worktree or a submodule has a .git file with one line "gitdir: <path>". */
    private fun linked(dotGit: Path): Path? =
        Files.readString(dotGit).trim().takeIf { it.startsWith(PREFIX) }
            ?.removePrefix(PREFIX)?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { dotGit.parent.resolve(it).normalize() }

    private const val PREFIX = "gitdir:"
}
