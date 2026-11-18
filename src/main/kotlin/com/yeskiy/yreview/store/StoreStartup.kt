package com.yeskiy.yreview.store

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import git4idea.repo.GitRepositoryManager

/** Moves the child folder stores of each repository into its git notes when the project opens. */
class StoreStartup : ProjectActivity {

    override suspend fun execute(project: Project) {
        ProjectLevelVcsManager.getInstance(project).runAfterInitialization {
            val service = ReviewService.getInstance(project)
            GitRepositoryManager.getInstance(project).repositories.forEach { service.settleRepository(it.root) }
        }
    }
}
