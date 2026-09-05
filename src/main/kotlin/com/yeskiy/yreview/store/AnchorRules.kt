package com.yeskiy.yreview.store

/**
 * The rule that decides where the comments of one file live.
 *
 * A file belongs to the innermost git repository that holds it. Only a file that no
 * repository holds belongs to a folder store. This object answers both halves, and it
 * takes plain strings so that a test needs no project.
 */
object AnchorRules {

    /**
     * The whole rule for one file.
     *
     * A repository that holds the file answers first, so a file inside an inner repository
     * never reaches the folder of a parent. A repository without a commit refuses, and it
     * still takes no folder, because the repository owns its own files.
     *
     * [projectDir] and [contentRoots] read the project, so the rule calls them only after
     * it knows that no repository holds the file.
     */
    fun plan(
        filePath: String,
        repositoryRoot: String?,
        head: String?,
        projectDir: () -> String?,
        contentRoots: () -> List<String>,
    ): AnchorPlan {
        if (repositoryRoot != null) {
            if (head == null) return AnchorPlan.NoCommit
            val path = relative(filePath, repositoryRoot) ?: return AnchorPlan.NoPlace
            return AnchorPlan.Git(repositoryRoot, head, path)
        }
        val root = folderRoot(filePath, projectDir(), contentRoots()) ?: return AnchorPlan.NoPlace
        val path = relative(filePath, root) ?: return AnchorPlan.NoPlace
        return AnchorPlan.Folder(root, path)
    }

    /**
     * The folder that holds the .y-review store of this file, or null when the project has
     * no place for it.
     *
     * The project directory comes first, because a build tool gives every module a content
     * root, and a rule that took the content root first would put a store in every module.
     */
    fun folderRoot(filePath: String, projectDir: String?, contentRoots: List<String>): String? {
        if (projectDir != null && holds(projectDir, filePath)) return projectDir
        return contentRoots.filter { holds(it, filePath) }.maxByOrNull { it.length }
    }

    /** True when the root is the file or an ancestor of it. A name prefix is not an ancestor. */
    fun holds(root: String, filePath: String): Boolean =
        filePath == root || filePath.startsWith("$root/")

    /**
     * True when this repository holds the file, and no repository inside it holds the file.
     *
     * A repository inside another repository owns its own files, and git reads them that
     * way. A reader that walks every root therefore leaves such a file to the inner
     * repository, so one file reaches one repository and its task appears once.
     */
    fun ownsFile(root: String, filePath: String, roots: List<String>): Boolean =
        holds(root, filePath) && roots.none { it.length > root.length && holds(it, filePath) }

    /** The path of the file under the root, or null when the root does not hold the file. */
    fun relative(filePath: String, root: String): String? {
        if (!filePath.startsWith("$root/")) return null
        return filePath.removePrefix("$root/").ifEmpty { null }
    }
}

/**
 * What the store rule answers for one file, in plain values.
 *
 * The rule runs on strings, so a test proves it without a project and without a display.
 * [com.yeskiy.yreview.store.ReviewService.anchorOf] turns the answer into a [ReviewAnchor].
 */
sealed interface AnchorPlan {

    /** A git repository holds the file, and the comments go to the notes of that repository. */
    data class Git(val root: String, val commit: String, val path: String) : AnchorPlan

    /** No repository holds the file, so the comments go to the folder store at [root]. */
    data class Folder(val root: String, val path: String) : AnchorPlan

    /** A repository holds the file, and that repository has no commit yet. */
    data object NoCommit : AnchorPlan

    /** The project holds no place for the comments of this file. */
    data object NoPlace : AnchorPlan
}
