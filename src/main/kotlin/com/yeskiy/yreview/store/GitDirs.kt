package com.yeskiy.yreview.store

import java.nio.file.Files
import java.nio.file.Path

/** The git folders of a working tree root, read from the files that git writes. Null when the layout is not plain. */
object GitDirs {

    fun commonDir(root: String): Path? = runCatching { gitDir(root)?.let(::commonOf) }.getOrNull()

    /** The commit of HEAD, "unborn:<ref>" for a branch with no commit, or null when the files give no sure answer. */
    fun head(root: String): String? = runCatching {
        val gitDir = gitDir(root) ?: return null
        val common = commonOf(gitDir) ?: return null
        val text = Files.readString(gitDir.resolve("HEAD")).trim()
        val ref = text.takeIf { it.startsWith(REF) }?.removePrefix(REF)?.trim()
        when {
            ref == null -> text.takeIf { OBJECT_ID.matches(it) }
            !ref.startsWith("refs/") -> null
            else -> NoteTips.read(common, listOf(ref))?.let { it[ref] ?: "unborn:$ref" }
        }
    }.getOrNull()

    private fun gitDir(root: String): Path? {
        if (System.getenv("GIT_DIR") != null || System.getenv("GIT_COMMON_DIR") != null) return null
        val dotGit = Path.of(root, ".git")
        return when {
            Files.isDirectory(dotGit) -> dotGit
            Files.isRegularFile(dotGit) -> linked(dotGit)
            else -> null
        }
    }

    private fun commonOf(gitDir: Path): Path? {
        val common = gitDir.resolve("commondir").takeIf { Files.isRegularFile(it) }
            ?.let { gitDir.resolve(Files.readString(it).trim()).normalize() } ?: gitDir
        return common.takeIf { Files.isDirectory(it.resolve("refs")) && !Files.exists(it.resolve("reftable")) }
    }

    /** A linked worktree or a submodule has a .git file with one line "gitdir: <path>". */
    private fun linked(dotGit: Path): Path? =
        Files.readString(dotGit).trim().takeIf { it.startsWith(PREFIX) }
            ?.removePrefix(PREFIX)?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { dotGit.parent.resolve(it).normalize() }

    private const val PREFIX = "gitdir:"

    private const val REF = "ref:"

    private val OBJECT_ID = Regex("^[0-9a-f]{40}([0-9a-f]{24})?$")
}
