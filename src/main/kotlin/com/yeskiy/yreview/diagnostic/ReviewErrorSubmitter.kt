package com.yeskiy.yreview.diagnostic

import com.intellij.ide.BrowserUtil
import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.diagnostic.ErrorReportSubmitter
import com.intellij.openapi.diagnostic.IdeaLoggingEvent
import com.intellij.openapi.diagnostic.SubmittedReportInfo
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.Consumer
import com.yeskiy.yreview.settings.ProductName
import java.awt.Component

/**
 * Hands one exception of the plugin to the issue tracker of the plugin.
 *
 * Nothing travels from the IDE. The class builds the text, then it opens a prefilled issue
 * form in the browser. The user reads the text and presses Submit there.
 *
 * Without this class the error dialog of the IDE offers only Disable Plugin for a plugin
 * of a third party, and it states that the vendor wrote no reporting component.
 */
class ReviewErrorSubmitter : ErrorReportSubmitter() {

    override fun getReportActionText(): String = "Report to the ${ProductName.TEXT} Issue Tracker"

    override fun getPrivacyNoticeText(): String =
        "This opens a new issue form in your browser. It fills in the error and the versions. " +
            "Nothing goes anywhere until you read the form and press Submit. " +
            "A long report goes to the clipboard instead, and then you paste it into the form. " +
            "GitHub shows every issue in public."

    override fun submit(
        events: Array<out IdeaLoggingEvent>,
        additionalInfo: String?,
        parentComponent: Component,
        consumer: Consumer<in SubmittedReportInfo>,
    ): Boolean {
        val projectPath = projectPathOf(parentComponent)
        val body = IssueForm.body(
            additionalInfo,
            events.map { it.throwableText },
            DiagnosticReport.head(machine()),
            projectPath,
        )
        val form = IssueForm.form(ISSUE_URL, title(events, projectPath), body)
        if (!form.prefilled) CopyPasteManager.copyTextToClipboard(body)
        BrowserUtil.browse(form.url)
        consumer.consume(SubmittedReportInfo(SubmittedReportInfo.SubmissionStatus.NEW_ISSUE))
        return true
    }

    /**
     * The folder of the project the error came from.
     *
     * The error dialog of the IDE hands this class the component of the dialog, and the data
     * context of that component carries the project. A dialog that names no project leaves
     * one open project as the only answer, and several open projects leave none.
     */
    private fun projectPathOf(component: Component): String? = runCatching {
        DataManager.getInstance().getDataContext(component).getData(CommonDataKeys.PROJECT)
            ?: singleProject()
    }.getOrNull()?.basePath

    private fun singleProject(): Project? =
        ProjectManager.getInstance().openProjects.singleOrNull()

    /** A failure in the reader of the versions must not stop the report. */
    private fun machine(): MachineFacts = runCatching { DiagnosticReport.machine() }.getOrElse { EMPTY_MACHINE }

    private fun title(events: Array<out IdeaLoggingEvent>, projectPath: String?): String =
        events.firstOrNull()?.throwable
            ?.let { IssueForm.title(it::class.java.simpleName, it.message.orEmpty(), projectPath) }
            ?: "A ${ProductName.TEXT} error"

    private companion object {

        const val ISSUE_URL = "https://github.com/yeskiy/yreview/issues/new"

        val EMPTY_MACHINE = MachineFacts(
            pluginVersion = DiagnosticReport.UNKNOWN,
            ideBuild = DiagnosticReport.UNKNOWN,
            os = DiagnosticReport.UNKNOWN,
            javaVersion = DiagnosticReport.UNKNOWN,
            terminalPlugin = false,
            mcpPlugin = false,
        )
    }
}
