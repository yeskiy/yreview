package com.yeskiy.yreview.store

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.ui.ReviewNotice
import git4idea.config.GitExecutableManager
import java.io.File

/**
 * Builds a runner for one repository root, using the git executable the IDE resolved.
 *
 * The bundled version control plugin also offers `GitLineHandler`, but it needs a
 * `GitCommand`, and `GitCommand` has no constant for `notes`. Its `read` and `write`
 * factories are private, so a third party plugin cannot build one.
 */
fun ideGitRunner(project: Project, root: VirtualFile): GitRunner =
    ReportingGitRunner(
        project,
        ProcessGitRunner(File(root.path), GitExecutableManager.getInstance().getPathToGit(project)),
    )

/**
 * Tells the user that git did not start, and then hands the answer on.
 *
 * A read of the store answers with an empty store when git fails, and the user would read
 * that as a project without review tasks. One message names the real problem. The answer
 * still travels to the caller, so a write refuses and states the same reason.
 */
private class ReportingGitRunner(
    private val project: Project,
    private val runner: GitRunner,
) : GitRunner {

    override fun run(vararg args: String): GitResult {
        val result = runner.run(*args)
        if (!result.ran && project.service<GitStartNotice>().first()) {
            ReviewNotice.warn(project, result.stderr)
        }
        return result
    }
}
