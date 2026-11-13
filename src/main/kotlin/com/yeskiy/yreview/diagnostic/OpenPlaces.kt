package com.yeskiy.yreview.diagnostic

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.ControlFlowException
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import git4idea.repo.GitRepositoryManager

/**
 * The folders of this machine that the open projects name. [Redact] takes each one out
 * of a report. A run with no IDE, for example a unit test, gives empty lists.
 */
object OpenPlaces {

    fun projects(): List<String> = openProjects().mapNotNull { it.basePath }

    /** A git repository of a project can stand outside the folder of that project. */
    fun repositories(): List<String> = openProjects().flatMap { project ->
        try {
            GitRepositoryManager.getInstance(project).repositories.map { it.root.path }
        } catch (failure: RuntimeException) {
            if (failure is ControlFlowException) throw failure
            emptyList()
        }
    }

    private fun openProjects(): List<Project> =
        if (ApplicationManager.getApplication() == null) emptyList()
        else ProjectManager.getInstance().openProjects.filterNot { it.isDisposed }
}
