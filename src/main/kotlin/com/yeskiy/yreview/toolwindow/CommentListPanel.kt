package com.yeskiy.yreview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.bridge.SendMessages
import com.yeskiy.yreview.bridge.SendReport
import com.yeskiy.yreview.settings.ShareLog
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.ui.ReviewNotice
import com.yeskiy.yreview.ui.ShareFailure
import git4idea.repo.GitRepositoryManager
import java.awt.BorderLayout
import javax.swing.DefaultListModel
import javax.swing.JPanel

class CommentListPanel(private val project: Project) : JPanel(BorderLayout()), Disposable {

    private val model = DefaultListModel<String>()
    private val list = JBList(model)
    private val rows = mutableListOf<StoredComment>()
    private var root: VirtualFile? = null

    init {
        val actions = DefaultActionGroup(RefreshAction(), ResolveAction(), SendAllAction())
        val toolbar = ActionManager.getInstance().createActionToolbar("YReviewComments", actions, true)
        toolbar.targetComponent = this
        add(toolbar.component, BorderLayout.NORTH)
        add(JBScrollPane(list), BorderLayout.CENTER)
        project.messageBus.connect(this).subscribe(REVIEW_COMMENTS, ReviewCommentListener { reload() })
        BridgeService.getInstance(project).startLater()
        reload()
    }

    override fun dispose() = Unit

    fun reload() {
        model.clear()
        rows.clear()
        root = null

        val file = FileEditorManager.getInstance(project).selectedFiles.firstOrNull() ?: return
        val service = ReviewService.getInstance(project)
        val commit = service.headOf(file) ?: return
        val repositoryRoot = service.repositoryRoot(file) ?: return
        root = repositoryRoot
        val log = ShareLog.getInstance(project)

        service.bookForRoot(repositoryRoot).open(commit, NoteRefs.ALL).forEach { stored ->
            rows.add(stored)
            model.addElement(CommentRow.format(stored, log.isUnshared(stored.id)))
        }
    }

    /**
     * Hands every open comment of this repository to the sessions that read the bridge.
     * The work runs off the user interface thread, because it reads the git notes.
     */
    private fun sendAll() {
        val here = root ?: onlyRoot()
        if (here == null) {
            ReviewNotice.warn(project, "Open a file of the repository you want to send.")
            return
        }
        val notice = SendMessages.of(
            ProgressManager.getInstance().runProcessWithProgressSynchronously(
                ThrowableComputable<SendReport, RuntimeException> {
                    BridgeService.getInstance(project).sendOpenComments(here)
                },
                "Sending the Review Comments",
                true,
                project,
            )
        )
        if (notice.warning) ReviewNotice.warn(project, notice.text) else ReviewNotice.say(project, notice.text)
    }

    /** A project with one repository needs no open file to know which comments to send. */
    private fun onlyRoot(): VirtualFile? =
        GitRepositoryManager.getInstance(project).repositories.singleOrNull()?.root

    private fun resolveSelected() {
        val stored = rows.getOrNull(list.selectedIndex) ?: return
        val here = root ?: return
        val result = ReviewService.getInstance(project).resolveComment(here, stored)
        result.shareError?.let { ShareFailure.report(project, "Resolve Review Comment", it) }
    }

    private inner class RefreshAction :
        AnAction("Refresh", "Read the comments of the open file again.", AllIcons.Actions.Refresh) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun actionPerformed(event: AnActionEvent) = reload()
    }

    private inner class ResolveAction :
        AnAction("Resolve", "Mark the selected comment resolved.", AllIcons.Actions.Commit) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = list.selectedIndex in rows.indices
        }

        override fun actionPerformed(event: AnActionEvent) = resolveSelected()
    }

    private inner class SendAllAction : AnAction(
        "Send All Comments",
        "Send every open review comment to the Claude Code session that reads this project.",
        AllIcons.Actions.Upload,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun actionPerformed(event: AnActionEvent) = sendAll()
    }
}
