package com.yeskiy.ideareview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.yeskiy.ideareview.settings.ShareLog
import com.yeskiy.ideareview.store.NoteRefs
import com.yeskiy.ideareview.store.REVIEW_COMMENTS
import com.yeskiy.ideareview.store.ReviewCommentListener
import com.yeskiy.ideareview.store.ReviewService
import com.yeskiy.ideareview.store.StoredComment
import com.yeskiy.ideareview.ui.ShareFailure
import java.awt.BorderLayout
import javax.swing.DefaultListModel
import javax.swing.JPanel

class CommentListPanel(private val project: Project) : JPanel(BorderLayout()), Disposable {

    private val model = DefaultListModel<String>()
    private val list = JBList(model)
    private val rows = mutableListOf<StoredComment>()
    private var root: VirtualFile? = null

    init {
        val toolbar = ActionManager.getInstance()
            .createActionToolbar("IdeaReviewComments", DefaultActionGroup(RefreshAction(), ResolveAction()), true)
        toolbar.targetComponent = this
        add(toolbar.component, BorderLayout.NORTH)
        add(JBScrollPane(list), BorderLayout.CENTER)
        project.messageBus.connect(this).subscribe(REVIEW_COMMENTS, ReviewCommentListener { reload() })
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
}
