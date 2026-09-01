package com.yeskiy.yreview.store

/**
 * The rule that decides where the comments of one file live.
 *
 * A file belongs to the innermost git repository that holds it. Only a file that no
 * repository holds belongs to a folder store. This object answers the second half, and it
 * takes plain strings so that a test needs no project.
 */
object AnchorRules {

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

    /** The path of the file under the root, or null when the root does not hold the file. */
    fun relative(filePath: String, root: String): String? {
        if (!filePath.startsWith("$root/")) return null
        return filePath.removePrefix("$root/").ifEmpty { null }
    }
}
