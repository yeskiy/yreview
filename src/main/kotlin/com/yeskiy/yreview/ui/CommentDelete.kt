package com.yeskiy.yreview.ui

import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.ThrowableComputable
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.tasks.RemoveReport
import com.yeskiy.yreview.tasks.TaskLabels
import com.yeskiy.yreview.tasks.TaskRemoval

/**
 * Removes one review comment from the git notes.
 *
 * The tree of the tool window and the card of the editor take the same road. Both ask the user
 * first, both run [TaskRemoval] under a progress window, and both report the same counts.
 */
object CommentDelete {

    const val TITLE = "Delete the Review Comment"

    /**
     * Deletes [stored] after the user says yes, then closes the card with [close].
     *
     * You cannot put a review comment back. The plugin keeps no copy of the removed line, so
     * the dialog names the risk before the work starts. A delete that removes nothing leaves
     * the card open, because the comment is still there.
     */
    fun run(project: Project, stored: StoredComment, close: () -> Unit) {
        if (!asks(project)) return
        val report = remove(project, stored)
        if (report.removed > 0) close()
        tell(project, report)
    }

    private fun asks(project: Project): Boolean =
        Messages.showYesNoDialog(
            project,
            "You cannot put a review comment back. The plugin removes this comment from its store.",
            TITLE,
            Messages.getWarningIcon(),
        ) == Messages.YES

    /** A note write runs git, so it runs off the user interface thread under a progress. */
    private fun remove(project: Project, stored: StoredComment): RemoveReport =
        ProgressManager.getInstance().runProcessWithProgressSynchronously(
            ThrowableComputable<RemoveReport, RuntimeException> {
                TaskRemoval.getInstance(project).delete(listOf(stored.id))
            },
            "Deleting the Review Comment",
            true,
            project,
        )

    private fun tell(project: Project, report: RemoveReport) {
        val warnings = listOfNotNull(
            report.problem,
            report.takeIf { it.removed == 0 }?.let { "The git notes hold no line for that comment." },
        )
        val text = "The IDE deleted ${TaskLabels.count(report.removed, "review comment")}. " +
            warnings.joinToString(" ")
        if (warnings.isEmpty()) ReviewNotice.say(project, text.trim()) else ReviewNotice.warn(project, text.trim())
    }
}
