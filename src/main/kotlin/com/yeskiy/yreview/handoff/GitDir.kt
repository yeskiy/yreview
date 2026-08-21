package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.store.GitRunner
import java.nio.file.Path

/**
 * Finds the git directory of one repository.
 *
 * A worktree and a submodule both keep a .git file that points somewhere else, so the
 * folder name alone is not enough. Git knows the answer, so the plugin asks git.
 */
object GitDir {

    const val FOLDER = "y-review"

    fun of(git: GitRunner): Path? {
        val result = git.run("rev-parse", "--absolute-git-dir")
        if (!result.ok) return null
        val text = result.stdout.trim()
        if (text.isEmpty()) return null
        return runCatching { Path.of(text) }.getOrNull()
    }

    fun reviewFolder(git: GitRunner): Path? = of(git)?.resolve(FOLDER)

    /**
     * The name of the review folder for a person and for an agent.
     *
     * The name stays relative when the folder sits inside the repository, because an agent
     * works from the repository root. A worktree keeps its git directory somewhere else,
     * and there the whole path is the only name that opens the file.
     */
    fun label(folder: Path, root: Path): String {
        val absolute = folder.toAbsolutePath().normalize()
        val base = root.toAbsolutePath().normalize()
        if (!absolute.startsWith(base)) return absolute.toString().replace('\\', '/')
        return base.relativize(absolute).toString().replace('\\', '/')
    }
}
