package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.actions.diff.ShowDiffAction
import com.intellij.vcsUtil.VcsUtil
import com.yeskiy.yreview.tasks.CarryKind
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskPath
import git4idea.GitContentRevision
import git4idea.GitRevisionNumber

/** Opens the file of a removed comment as it was at the comment commit. The diff side draws the comment. */
object RemovedFileDiff {

    fun canOpen(task: ReviewTask): Boolean =
        task.carry?.kind == CarryKind.REMOVED && TaskPath.isUnder(task.rootPath, task.filePath)

    fun open(project: Project, task: ReviewTask) {
        val carry = task.carry ?: return
        if (!canOpen(task)) return
        val before = GitContentRevision.createRevision(VcsUtil.getFilePath(task.filePath, false), GitRevisionNumber(carry.commit), project)
        ShowDiffAction.showDiffForChange(project, listOf(Change(before, null)))
    }
}
