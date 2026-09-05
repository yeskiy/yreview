package com.yeskiy.yreview.store

/**
 * Whether the review folder of one root belongs to the plugin.
 *
 * The folder store holds the records of a folder that no git repository covers, and the
 * plugin writes every one of those records itself. A repository can also track a folder of
 * the same name, and then the records inside it come from the person who wrote the commit.
 * Such a folder is not the store of the plugin. The plugin therefore moves no file of it
 * and copies no record out of it.
 *
 * `git ls-files --error-unmatch` answers with the exit code alone, so the caller reads no
 * output and the answer costs one short run. The exit code is 0 when git tracks at least
 * one file under the folder.
 *
 * The pathspec carries the literal mark, so git reads the name as plain characters. Git
 * reads a bracket in a pathspec as a pattern, and such a pattern can reach another tracked
 * path. The mark keeps the answer about this folder alone.
 *
 * The runner must work in the folder that holds the review folder, because git reads a
 * pathspec from the working directory of the run.
 */
object FolderOwnership {

    /** The mark that makes git read a pathspec as plain characters. */
    const val LITERAL = ":(literal)"

    /** True when git tracks at least one file under this folder. */
    fun tracked(runner: GitRunner, folder: String = FolderStore.FOLDER): Boolean =
        runner.run("ls-files", "--error-unmatch", "--", LITERAL + folder).ok

    /** True when the plugin may move the records of this folder into the git notes. */
    fun mayMigrate(runner: GitRunner, folder: String = FolderStore.FOLDER): Boolean =
        !tracked(runner, folder)
}
