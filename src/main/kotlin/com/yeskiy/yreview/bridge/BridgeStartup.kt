package com.yeskiy.yreview.bridge

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import git4idea.repo.GitRepositoryManager

/**
 * Starts the bridge of one project when the project opens.
 *
 * A session reads the address of the bridge from a file, and the file must exist before
 * the session starts. The user opens the two tool windows in any order, so the project
 * itself opens the port. A project without a git repository reviews nothing, and there the
 * bridge stays closed.
 *
 * The repository list is empty until the version control manager ends its start, so the
 * work waits for that end.
 */
class BridgeStartup : ProjectActivity {

    override suspend fun execute(project: Project) {
        ProjectLevelVcsManager.getInstance(project).runAfterInitialization {
            if (GitRepositoryManager.getInstance(project).repositories.isNotEmpty()) {
                BridgeService.getInstance(project).startLater()
            }
        }
    }
}
