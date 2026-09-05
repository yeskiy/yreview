package com.yeskiy.yreview.tasks

/**
 * The rule for the file that one task names.
 *
 * The path of a comment comes from a note record, and another person can write that
 * record. A step of two dots climbs one folder, and the file system of the IDE follows
 * that climb, so a note can name a file outside the repository it belongs to.
 *
 * A task therefore opens a file only while the file stays under the root of its own
 * repository. The rule reads a path and no disk, so it holds for a path that no file
 * system knows yet.
 */
object TaskPath {

    /** The step that climbs one folder. */
    const val UP = ".."

    /** True when this file stays under the root that the task names. */
    fun isUnder(rootPath: String, filePath: String): Boolean {
        val root = resolve(rootPath)
        val file = resolve(filePath)
        return root.isNotEmpty() &&
            file.length > root.length + 1 &&
            file.startsWith(root) &&
            file[root.length] == SEPARATOR
    }

    /**
     * The same path, with one separator, and with every step that moves already made.
     *
     * A step of two dots at the top of a path climbs nothing, because no folder stands
     * over the top. The answer keeps the leading separator of a path that starts at the
     * root of a disk.
     */
    fun resolve(path: String): String {
        val plain = path.replace('\\', SEPARATOR)
        val lead = if (plain.startsWith(SEPARATOR)) SEPARATOR.toString() else ""
        return lead + steps(plain).joinToString(SEPARATOR.toString())
    }

    private fun steps(path: String): List<String> =
        path.split(SEPARATOR).fold(mutableListOf<String>()) { steps, step ->
            when (step) {
                "", "." -> steps
                UP -> steps.also { it.removeLastOrNull() }
                else -> steps.also { it.add(step) }
            }
        }

    private const val SEPARATOR = '/'
}
