package com.yeskiy.yreview.store

/**
 * The rule that decides where the comments of one file live. A repository with a commit owns
 * its files. Else the nearest folder store of the walk does. The rule takes plain strings.
 */
object AnchorRules {

    /**
     * The whole rule for one file. A repository with a commit answers first, then the walk
     * finds the nearest store. [workspaceRoot] reads the project, so only the walk calls it.
     */
    fun plan(
        filePath: String,
        repositoryRoot: String?,
        head: String?,
        workspaceRoot: () -> String?,
        home: String?,
        hasStore: (String) -> Boolean,
    ): AnchorPlan {
        if (repositoryRoot != null && head != null) {
            val path = relative(filePath, repositoryRoot) ?: return AnchorPlan.NoPlace
            return AnchorPlan.Git(repositoryRoot, head, path)
        }
        if (StoreRules.isHomeFile(filePath, home)) return AnchorPlan.HomeFile
        val dir = StoreRules.parentOf(filePath) ?: return AnchorPlan.NoPlace
        val ceiling = workspaceRoot()?.takeIf { holds(it, dir) }
        val walk = StoreRules.walk(dir, ceiling, home)
        walk.firstOrNull(hasStore)?.let { found ->
            return relative(filePath, found)?.let { AnchorPlan.Folder(found, it, exists = true) } ?: AnchorPlan.NoPlace
        }
        if (repositoryRoot != null) return AnchorPlan.NoCommit
        val create = ceiling?.takeIf { it in walk } ?: dir
        return relative(filePath, create)?.let { AnchorPlan.Folder(create, it, exists = false) } ?: AnchorPlan.NoPlace
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
        filePath == root || filePath.startsWith(withSlash(root))

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
        val prefix = withSlash(root)
        if (!filePath.startsWith(prefix)) return null
        return filePath.removePrefix(prefix).ifEmpty { null }
    }

    /** A root such as "/" or "C:/" already ends with a slash, so the rule adds none. */
    private fun withSlash(root: String): String = if (root.endsWith("/")) root else "$root/"
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

    /** The comments go to the folder store at [root]. [exists] is false when the store is still to be made. */
    data class Folder(val root: String, val path: String, val exists: Boolean = true) : AnchorPlan

    /** A repository holds the file, and that repository has no commit yet. */
    data object NoCommit : AnchorPlan

    /** A file directly in the home folder or in the bridge folder. It gets no store. */
    data object HomeFile : AnchorPlan

    /** The project holds no place for the comments of this file. */
    data object NoPlace : AnchorPlan
}
