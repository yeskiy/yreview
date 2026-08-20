package com.yeskiy.ideareview.store

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
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
    ProcessGitRunner(File(root.path), GitExecutableManager.getInstance().getPathToGit(project))
