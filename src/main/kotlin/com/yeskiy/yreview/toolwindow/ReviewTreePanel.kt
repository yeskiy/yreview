package com.yeskiy.yreview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.CommonActionsManager
import com.intellij.ide.DefaultTreeExpander
import com.intellij.ide.todo.TodoConfiguration
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataSink
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.FileTypeEvent
import com.intellij.openapi.fileTypes.FileTypeListener
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiTreeChangeAdapter
import com.intellij.psi.PsiTreeChangeEvent
import com.intellij.psi.search.IndexPatternProvider
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.EditSourceOnDoubleClickHandler
import com.intellij.util.EditSourceOnEnterKeyHandler
import com.intellij.util.ui.tree.TreeUtil
import com.intellij.util.ui.update.MergingUpdateQueue
import com.intellij.util.ui.update.Update
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.bridge.SendMessages
import com.yeskiy.yreview.bridge.SendReport
import com.yeskiy.yreview.bridge.SendRoute
import com.yeskiy.yreview.handoff.DoneWatch
import com.yeskiy.yreview.handoff.GitDir
import com.yeskiy.yreview.handoff.HandoffFiles
import com.yeskiy.yreview.handoff.HandoffPrompt
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.store.ideGitRunner
import com.yeskiy.yreview.tasks.CloseReport
import com.yeskiy.yreview.tasks.RepositoryTasks
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskCompletion
import com.yeskiy.yreview.tasks.TaskDocument
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TaskLabels
import com.yeskiy.yreview.tasks.TaskScan
import com.yeskiy.yreview.tasks.TaskTree
import com.yeskiy.yreview.ui.ReviewNotice
import java.beans.PropertyChangeListener
import java.io.IOException
import java.nio.file.Path
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.swing.tree.TreeSelectionModel

/** The tasks that went out, and the text the user pastes when the channel is out of reach. */
private data class SendOutcome(val report: SendReport, val clipboard: String?)

/**
 * The review tool window.
 *
 * The tree holds every open task of the project, grouped by file. A review comment comes
 * from the git notes. A TODO and a FIXME come from the same reader the built-in TODO view
 * uses. A filter action shows the open file only, and the choice stays after a restart.
 */
class ReviewTreePanel(private val project: Project) : SimpleToolWindowPanel(true, true), Disposable {

    private val structure = TaskStructure(project)

    private val treeModel = StructureTreeModel(structure, this)

    private val tree = Tree(AsyncTreeModel(treeModel, this))

    private val queue = MergingUpdateQueue("y-review-tasks", RELOAD_DELAY, true, this, this)

    private val settings = ReviewSettings.getInstance(project)

    @Volatile
    private var repositories: List<RepositoryTasks> = emptyList()

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.setRowHeight(0)
        tree.selectionModel.selectionMode = TreeSelectionModel.DISCONTIGUOUS_TREE_SELECTION
        tree.emptyText.text = "This project has no open review task."
        TreeUIHelper.getInstance().installTreeSpeedSearch(tree)
        EditSourceOnDoubleClickHandler.install(tree)
        EditSourceOnEnterKeyHandler.install(tree)

        val actions = actionGroup()
        val toolbar = ActionManager.getInstance().createActionToolbar("YReviewTasks", actions, true)
        toolbar.targetComponent = tree
        setToolbar(toolbar.component)
        setContent(ScrollPaneFactory.createScrollPane(tree, true))
        PopupHandler.installPopupMenu(tree, actions, "YReviewTasksPopup")

        subscribe()
        BridgeService.getInstance(project).startLater()
        scheduleReload()
    }

    override fun dispose() = Unit

    /** The platform reads the selection here, so double click and the Enter key open the file. */
    override fun uiDataSnapshot(sink: DataSink) {
        super.uiDataSnapshot(sink)
        val nodes = TreeUtil.collectSelectedObjectsOfType(tree, TaskNode::class.java)
        if (nodes.isEmpty()) return
        sink.set(CommonDataKeys.NAVIGATABLE_ARRAY, nodes.toTypedArray())
    }

    // --- Reading the tasks ---

    private fun scheduleReload() {
        queue.queue(object : Update("reload") {
            override fun run() = reload()
        })
    }

    private fun reload() {
        val onlyFile = if (settings.currentFileOnly) openFile() else null
        ApplicationManager.getApplication().executeOnPooledThread {
            if (project.isDisposed) return@executeOnPooledThread
            val found = try {
                TaskScan.read(project, onlyFile)
            } catch (failure: RuntimeException) {
                logger.warn("the review tool window could not read the tasks", failure)
                emptyList()
            }
            ApplicationManager.getApplication().invokeLater({ show(found) }, project.disposed)
        }
    }

    private fun show(found: List<RepositoryTasks>) {
        repositories = found
        val several = found.size > 1
        structure.groups = TaskTree.group(found.flatMap { it.tasks }) { task -> label(task, several) }
        treeModel.invalidateAsync()
    }

    /** A project with several repositories shows the repository name in front of the path. */
    private fun label(task: ReviewTask, several: Boolean): String =
        if (several) "${task.rootPath.substringAfterLast('/')}/${task.path}" else task.path

    private fun openFile() = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()

    // --- The selection ---

    private fun selectedTasks(): List<ReviewTask> =
        TreeUtil.collectSelectedObjectsOfType(tree, TaskNode::class.java).map { it.value } +
            TreeUtil.collectSelectedObjectsOfType(tree, FileNode::class.java).flatMap { it.value.tasks }

    private fun allTasks(): List<ReviewTask> = TaskTree.flatten(structure.groups)

    // --- Send ---

    /**
     * Hands the chosen tasks to an agent.
     *
     * The channel carries them when a session reads it. When no session reads it, the
     * plugin writes the files of the file protocol and copies a short prompt instead.
     */
    private fun send() {
        val chosen = selectedTasks().distinct().ifEmpty { allTasks() }
        if (chosen.isEmpty()) {
            ReviewNotice.warn(project, "This project has no open review task.")
            return
        }
        val roots = chosen.map { it.rootPath }.distinct()
        if (roots.size > 1) {
            ReviewNotice.warn(project, "Select the tasks of one repository. This selection holds ${roots.size}.")
            return
        }
        val repository = repositories.firstOrNull { it.root.path == roots.single() }
        if (repository == null) {
            ReviewNotice.warn(project, "Read the tasks again, because the repository of the selection is gone.")
            return
        }
        finish(
            ProgressManager.getInstance().runProcessWithProgressSynchronously(
                ThrowableComputable<SendOutcome, RuntimeException> { deliver(repository, chosen) },
                "Sending the Review Tasks",
                true,
                project,
            )
        )
    }

    private fun finish(outcome: SendOutcome) {
        outcome.clipboard?.let { CopyPasteManager.copyTextToClipboard(it) }
        val notice = SendMessages.of(outcome.report)
        if (notice.warning) ReviewNotice.warn(project, notice.text) else ReviewNotice.say(project, notice.text)
    }

    private fun deliver(repository: RepositoryTasks, tasks: List<ReviewTask>): SendOutcome {
        val files = writeFiles(repository, tasks)
        val bridge = BridgeService.getInstance(project)
        if (bridge.readerCount() > 0) return SendOutcome(bridge.sendTasks(repository.root, tasks), null)
        if (files == null) {
            return SendOutcome(
                SendReport(0, 0, 0, "The plugin did not find the git directory of ${repository.root.name}."),
                null,
            )
        }
        val folder = GitDir.label(files.folder, Path.of(repository.root.path))
        return SendOutcome(
            SendReport(tasks.size, 0, 0, route = SendRoute.CLIPBOARD, folder = folder),
            HandoffPrompt.of(folder, repository.commit, tasks),
        )
    }

    /** The rules and the tasks go to the git directory on every send, whatever the route is. */
    private fun writeFiles(repository: RepositoryTasks, tasks: List<ReviewTask>): HandoffFiles? {
        val folder = GitDir.reviewFolder(ideGitRunner(project, repository.root)) ?: return null
        val files = HandoffFiles(folder)
        return try {
            files.write(
                TaskDocument(
                    repository = repository.root.path,
                    commit = repository.commit,
                    generated = Instant.now().truncatedTo(ChronoUnit.SECONDS).toString(),
                    tasks = tasks,
                )
            )
            DoneWatch.getInstance(project).watch(files)
            files
        } catch (failure: IOException) {
            logger.warn("the review plugin did not write the task files", failure)
            null
        }
    }

    // --- Resolve ---

    private fun resolveSelected() {
        val ids = selectedTasks().filter { it.kind == TaskKind.COMMENT }.map { it.id }.distinct()
        if (ids.isEmpty()) {
            ReviewNotice.warn(project, "Select a review comment. A TODO closes when the line leaves the source.")
            return
        }
        val report = ProgressManager.getInstance().runProcessWithProgressSynchronously(
            ThrowableComputable<CloseReport, RuntimeException> { TaskCompletion.getInstance(project).close(ids) },
            "Resolving the Review Comments",
            true,
            project,
        )
        val problem = report.problem
        if (problem == null) {
            ReviewNotice.say(project, "The IDE resolved ${TaskLabels.count(report.closed, "comment")}.")
        } else {
            ReviewNotice.warn(project, problem)
        }
    }

    // --- The five signals ---

    private fun subscribe() {
        val onProject = project.messageBus.connect(this)
        onProject.subscribe(REVIEW_COMMENTS, ReviewCommentListener { scheduleReload() })
        onProject.subscribe(TodoConfiguration.PROPERTY_CHANGE, PropertyChangeListener { scheduleReload() })

        val onApplication = ApplicationManager.getApplication().messageBus.connect(this)
        onApplication.subscribe(IndexPatternProvider.INDEX_PATTERNS_CHANGED, PropertyChangeListener { scheduleReload() })
        onApplication.subscribe(
            FileTypeManager.TOPIC,
            object : FileTypeListener {
                override fun fileTypesChanged(event: FileTypeEvent) = scheduleReload()
            },
        )

        PsiManager.getInstance(project).addPsiTreeChangeListener(
            object : PsiTreeChangeAdapter() {
                override fun childrenChanged(event: PsiTreeChangeEvent) = scheduleReload()

                override fun propertyChanged(event: PsiTreeChangeEvent) = scheduleReload()
            },
            this,
        )
    }

    // --- The toolbar ---

    private fun actionGroup(): DefaultActionGroup {
        val expander = DefaultTreeExpander(tree)
        val common = CommonActionsManager.getInstance()
        return DefaultActionGroup(
            RefreshAction(),
            CurrentFileAction(),
            ResolveAction(),
            SendAction(),
            common.createExpandAllAction(expander, tree),
            common.createCollapseAllAction(expander, tree),
        )
    }

    private inner class RefreshAction :
        AnAction("Refresh", "Read the tasks of this project again.", AllIcons.Actions.Refresh) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun actionPerformed(event: AnActionEvent) = scheduleReload()
    }

    private inner class CurrentFileAction : ToggleAction(
        "Current File Only",
        "Show the tasks of the open file only.",
        AllIcons.General.Filter,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun isSelected(event: AnActionEvent): Boolean = settings.currentFileOnly

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            settings.currentFileOnly = state
            scheduleReload()
        }
    }

    private inner class ResolveAction :
        AnAction("Resolve", "Mark the selected review comments as resolved.", AllIcons.Actions.Commit) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = selectedTasks().any { it.kind == TaskKind.COMMENT }
        }

        override fun actionPerformed(event: AnActionEvent) = resolveSelected()
    }

    private inner class SendAction : AnAction(
        "Send to the Agent",
        "Send the selected tasks. The whole tree goes out when nothing is selected.",
        AllIcons.Actions.Upload,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun actionPerformed(event: AnActionEvent) = send()
    }

    companion object {
        private const val RELOAD_DELAY = 400

        private val logger = logger<ReviewTreePanel>()
    }
}
