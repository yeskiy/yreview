package com.yeskiy.yreview.diagnostic

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.yeskiy.yreview.settings.ProductName
import com.yeskiy.yreview.ui.ReviewNotice

/**
 * Puts the diagnostic report on the clipboard. Nothing leaves this machine.
 *
 * The user reads the text before the user pastes it into an issue, so the balloon says
 * what the report holds and asks the user to read it.
 */
class CopyDiagnosticsAction : AnAction() {

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        CopyPasteManager.copyTextToClipboard(DiagnosticReport.text(project))
        ReviewNotice.say(project, MESSAGE)
    }

    private companion object {
        const val MESSAGE =
            "The clipboard holds the ${ProductName.TEXT} diagnostic report. " +
                "It carries versions, switches and states, and no comment text. " +
                "Read it before you paste it into an issue."
    }
}
