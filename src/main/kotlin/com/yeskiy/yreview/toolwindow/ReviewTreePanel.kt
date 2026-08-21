package com.yeskiy.yreview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.CommonActionsManager
import com.intellij.ide.DefaultTreeExpander
import com.intellij.ide.OccurenceNavigator
import com.intellij.ide.actions.NextOccurenceToolbarAction
import com.intellij.ide.actions.PreviousOccurenceToolbarAction
import com.intellij.ide.todo.TodoConfiguration
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataSink
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.FileTypeEvent
import com.intellij.openapi.fileTypes.FileTypeListener
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.pom.Navigatable
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiTreeChangeAdapter
import com.intellij.psi.PsiTreeChangeEvent
import com.intellij.psi.search.IndexPatternProvider
import com.intellij.ui.AutoScrollToSourceHandler
import com.intellij.ui.CheckboxTreeHelper
import com.intellij.ui.OnePixelSplitter
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.tree.TreeVisitor
import com.intellij.ui.treeStructure.Tree
import com.intellij.usageView.UsageInfo
import com.intellij.usages.UsageViewPresentation
import com.intellij.usages.impl.UsagePreviewPanel
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
import com.yeskiy.yreview.tasks.CheckState
import com.yeskiy.yreview.tasks.CloseReport
import com.yeskiy.yreview.tasks.RepositoryTasks
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.SendScope
import com.yeskiy.yreview.tasks.SendTarget
import com.yeskiy.yreview.tasks.TaskChecks
import com.yeskiy.yreview.tasks.TaskChoice
import com.yeskiy.yreview.tasks.TaskCompletion
import com.yeskiy.yreview.tasks.TaskDocument
import com.yeskiy.yreview.tasks.TaskFilter
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TaskLabels
import com.yeskiy.yreview.tasks.TaskScan
import com.yeskiy.yreview.tasks.TaskTree
import com.yeskiy.yreview.ui.ReviewNotice
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.beans.PropertyChangeListener
import java.io.IOException
import java.nio.file.Path
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.swing.tree.TreeSelectionModel

/** The tasks that went out, and the text the user pastes when the channel is out of reach. */
private data class SendOutcome(val report: SendReport, val clipboard: String?)

/**
 * The review tool window, an enhanced TODO view.
 *
 * The tree holds every open task of the project. A review comment comes from the git
 * notes. A TODO and a FIXME come from the same reader the built-in TODO view uses, and
 * they keep the icon and the color the user configured for their pattern.
 *
 * The toolbar carries the controls of the built-in view. It groups by module and by
 * directory, it applies a TODO filter of the user, it walks the rows one by one, and it
 * opens a preview beside the tree. Every choice stays after a restart.
 *
 * Each row also carries a check box. The check box drives the send action and the resolve
 * action, and the checked identifiers survive a reload of the tree.
 */
class ReviewTreePanel(private val project: Project) :
    SimpleToolWindowPanel(true, true), Disposable, OccurenceNavigator {

    private val structure = TaskStructure(project)

    private val treeModel = StructureTreeModel(structure, this)

    private val tree = Tree(AsyncTreeModel(treeModel, this))

    private val queue = MergingUpdateQueue("y-review-tasks", RELOAD_DELAY, true, this, this)

    private val settings = ReviewSettings.getInstance(project)

    private val checks = TaskChecks()

    private val renderer = TaskCheckRenderer { holder -> checks.state(holder.tasks) }

    private val splitter = OnePixelSplitter(false, PREVIEW_PROPORTION, 0.6f)

    private val preview = UsagePreviewPanel(project, UsageViewPresentation())

    private val autoScroll = object : AutoScrollToSourceHandler() {
        override fun isAutoScrollMode(): Boolean = settings.autoScrollToSource

        override fun setAutoScrollMode(state: Boolean) {
            settings.autoScrollToSource = state
        }
    }

    private val toolbar: ActionToolbar

    @Volatile
    private var repositories: List<RepositoryTasks> = emptyList()

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.setRowHeight(0)
        tree.selectionModel.selectionMode = TreeSelectionModel.DISCONTIGUOUS_TREE_SELECTION
        tree.emptyText.text = "This project has no open review task."
        tree.cellRenderer = renderer
        TreeUIHelper.getInstance().installTreeSpeedSearch(tree)
        installChecks()
        EditSourceOnDoubleClickHandler.install(tree)
        EditSourceOnEnterKeyHandler.install(tree)
        autoScroll.install(tree)
        Disposer.register(this, preview)

        val expander = DefaultTreeExpander(tree)
        toolbar = ActionManager.getInstance().createActionToolbar(PLACE, toolbarGroup(expander), true)
        toolbar.targetComponent = tree
        setToolbar(toolbar.component)
        splitter.firstComponent = ScrollPaneFactory.createScrollPane(tree, true)
        setContent(splitter)
        showPreview(settings.showPreview)
        PopupHandler.installPopupMenu(tree, menuGroup(expander), "YReviewTasksPopup")
        tree.addTreeSelectionListener { updatePreview() }

        subscribe()
        BridgeService.getInstance(project).startLater()
        scheduleReload()
    }

    override fun dispose() = Unit

    /** The platform reads the selection here, so double click, Enter and the menu work. */
    override fun uiDataSnapshot(sink: DataSink) {
        super.uiDataSnapshot(sink)
        val files = TreeUtil.collectSelectedObjectsOfType(tree, TaskHolder::class.java)
            .flatMap { it.tasks }
            .mapNotNull { TaskNodes.find(it) }
            .distinct()
        if (files.isNotEmpty()) sink.set(CommonDataKeys.VIRTUAL_FILE_ARRAY, files.toTypedArray<VirtualFile>())
        val open = TreeUtil.collectSelectedObjectsOfType(tree, TaskNode::class.java) +
            TreeUtil.collectSelectedObjectsOfType(tree, FileNode::class.java)
        if (open.isNotEmpty()) sink.set(CommonDataKeys.NAVIGATABLE_ARRAY, open.toTypedArray<Navigatable>())
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
        structure.layout = TaskTree.layout(
            TaskTree.group(TaskFilter.apply(found.flatMap { it.tasks }, filterRules())) { task ->
                label(task, several)
            },
            settings.grouping,
        )
        treeModel.invalidateAsync()
        toolbar.updateActionsAsync()
    }

    /** The panel keeps the tasks it read, so a group change needs no second read of git. */
    private fun redraw() = show(repositories)

    /** A project with several repositories shows the repository name in front of the path. */
    private fun label(task: ReviewTask, several: Boolean): String =
        if (several) "${task.rootPath.substringAfterLast('/')}/${task.path}" else task.path

    private fun openFile() = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()

    /** The rules of the chosen TODO filter. A null value means that no filter is on. */
    private fun filterRules(): Set<String>? {
        if (settings.todoFilterName.isEmpty()) return null
        val filter = TodoConfiguration.getInstance().getTodoFilter(settings.todoFilterName) ?: return null
        return filter.iterator().asSequence().map { it.patternString }.toSet()
    }

    // --- The check boxes ---

    private fun installChecks() {
        tree.addMouseListener(object : MouseAdapter() {
            override fun mousePressed(event: MouseEvent) = clickCheck(event)
        })
        tree.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(event: KeyEvent) {
                if (!CheckboxTreeHelper.isToggleEvent(event, tree)) return
                toggle(TreeUtil.collectSelectedObjectsOfType(tree, TaskHolder::class.java).flatMap { it.tasks })
                event.consume()
            }
        })
    }

    /** A click on the check box toggles the row. A click beside it selects the row. */
    private fun clickCheck(event: MouseEvent) {
        if (event.clickCount != 1) return
        val path = tree.getPathForLocation(event.x, event.y) ?: return
        val bounds = tree.getPathBounds(path) ?: return
        if (event.x < bounds.x || event.x > bounds.x + renderer.boxWidth) return
        val holder = TreeUtil.getUserObject(path.lastPathComponent) as? TaskHolder ?: return
        toggle(holder.tasks)
        event.consume()
    }

    private fun toggle(tasks: List<ReviewTask>) {
        if (tasks.isEmpty()) return
        checks.set(tasks, checks.state(tasks) != CheckState.ALL)
        afterCheck()
    }

    private fun afterCheck() {
        tree.repaint()
        toolbar.updateActionsAsync()
    }

    // --- The selection ---

    private fun selectedTasks(): List<ReviewTask> =
        TreeUtil.collectSelectedObjectsOfType(tree, TaskHolder::class.java).flatMap { it.tasks }.distinct()

    private fun allTasks(): List<ReviewTask> = TaskTree.tasksOf(structure.layout)

    /** Where the send goes. A check box beats a row, and a row beats the whole tree. */
    private fun target(): SendTarget =
        TaskChoice.sendTarget(checks.checkedOf(allTasks()), selectedTasks(), allTasks())

    /** Resolve never falls back to the whole tree, because it writes to the git notes. */
    private fun resolveTargets(): List<ReviewTask> = checks.checkedOf(allTasks()).ifEmpty { selectedTasks() }

    // --- Send ---

    /**
     * Hands the chosen tasks to an agent.
     *
     * The channel carries them when a session reads it. When no session reads it, the
     * plugin writes the files of the file protocol and copies a short prompt instead.
     */
    private fun send() {
        val chosen = target().tasks
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
        val ids = resolveTargets().filter { it.kind == TaskKind.COMMENT }.map { it.id }.distinct()
        if (ids.isEmpty()) {
            ReviewNotice.warn(project, "Check a review comment. A TODO closes when the line leaves the source.")
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

    // --- The preview ---

    private fun showPreview(state: Boolean) {
        splitter.secondComponent = if (state) preview.createComponent() else null
        if (state) updatePreview()
    }

    private fun updatePreview() {
        if (!settings.showPreview) return
        val task = TreeUtil.collectSelectedObjectsOfType(tree, TaskNode::class.java).firstOrNull()?.value
        if (task == null) {
            preview.updateLayout(project, emptyList())
            return
        }
        ApplicationManager.getApplication().executeOnPooledThread {
            if (project.isDisposed) return@executeOnPooledThread
            val found = ReadAction.nonBlocking<List<UsageInfo>> { usages(task) }.executeSynchronously()
            ApplicationManager.getApplication().invokeLater({ preview.updateLayout(project, found) }, project.disposed)
        }
    }

    private fun usages(task: ReviewTask): List<UsageInfo> {
        val file = TaskNodes.find(task) ?: return emptyList()
        val psi = PsiManager.getInstance(project).findFile(file) ?: return emptyList()
        val document = PsiDocumentManager.getInstance(project).getDocument(psi) ?: return emptyList()
        if (document.lineCount == 0) return emptyList()
        val last = document.lineCount - 1
        val start = document.getLineStartOffset((task.startLine - 1).coerceIn(0, last))
        val end = document.getLineEndOffset((task.endLine - 1).coerceIn(0, last))
        return listOf(UsageInfo(psi, start, maxOf(start, end)))
    }

    // --- One row after the other ---

    override fun hasNextOccurence(): Boolean = TaskChoice.nextIndex(allTasks().size, currentRow()) >= 0

    override fun hasPreviousOccurence(): Boolean = TaskChoice.previousIndex(allTasks().size, currentRow()) >= 0

    override fun goNextOccurence(): OccurenceNavigator.OccurenceInfo? =
        goTo(TaskChoice.nextIndex(allTasks().size, currentRow()))

    override fun goPreviousOccurence(): OccurenceNavigator.OccurenceInfo? =
        goTo(TaskChoice.previousIndex(allTasks().size, currentRow()))

    override fun getNextOccurenceActionName(): String = "Next Task"

    override fun getPreviousOccurenceActionName(): String = "Previous Task"

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    private fun currentRow(): Int {
        val node = TreeUtil.collectSelectedObjectsOfType(tree, TaskNode::class.java).firstOrNull() ?: return -1
        val key = TaskChecks.keyOf(node.value)
        return allTasks().indexOfFirst { TaskChecks.keyOf(it) == key }
    }

    private fun goTo(index: Int): OccurenceNavigator.OccurenceInfo? {
        val rows = allTasks()
        val task = rows.getOrNull(index) ?: return null
        select(task)
        val descriptor = TaskNodes.descriptor(project, task)
            ?: return OccurenceNavigator.OccurenceInfo.position(index + 1, rows.size)
        return OccurenceNavigator.OccurenceInfo(descriptor, index + 1, rows.size)
    }

    private fun select(task: ReviewTask) {
        val key = TaskChecks.keyOf(task)
        TreeUtil.promiseSelect(
            tree,
            TreeVisitor { path ->
                val node = TreeUtil.getUserObject(path.lastPathComponent)
                when {
                    node is TaskNode -> stepInto(TaskChecks.keyOf(node.value) == key)
                    node is TaskHolder && node.tasks.any { TaskChecks.keyOf(it) == key } -> TreeVisitor.Action.CONTINUE
                    else -> TreeVisitor.Action.SKIP_CHILDREN
                }
            },
        )
    }

    private fun stepInto(hit: Boolean): TreeVisitor.Action =
        if (hit) TreeVisitor.Action.INTERRUPT else TreeVisitor.Action.SKIP_CHILDREN

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

    // --- The toolbar and the menu ---

    private fun toolbarGroup(expander: DefaultTreeExpander): DefaultActionGroup {
        val common = CommonActionsManager.getInstance()
        return DefaultActionGroup(
            PreviousOccurenceToolbarAction(this),
            NextOccurenceToolbarAction(this),
            FilterGroup(),
            autoScroll.createToggleAction(),
            common.createExpandAllAction(expander, tree),
            common.createCollapseAllAction(expander, tree),
            GroupByGroup(),
            PreviewAction(),
            Separator.getInstance(),
            RefreshAction(),
            CurrentFileAction(),
            CheckAllAction(),
            ClearChecksAction(),
            ResolveAction(),
            SendAction(),
        )
    }

    private fun menuGroup(expander: DefaultTreeExpander): DefaultActionGroup {
        val manager = ActionManager.getInstance()
        val common = CommonActionsManager.getInstance()
        return DefaultActionGroup(
            listOfNotNull(
                manager.getAction(IdeActions.ACTION_EDIT_SOURCE),
                Separator.getInstance(),
                common.createExpandAllAction(expander, tree),
                common.createCollapseAllAction(expander, tree),
                Separator.getInstance(),
                manager.getAction(IdeActions.GROUP_VERSION_CONTROLS),
            )
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

    /** The filters of the user, as Settings, Editor, TODO holds them. */
    private inner class FilterGroup : ActionGroup("Filter TODO Items", true) {

        init {
            templatePresentation.icon = AllIcons.General.Filter
            templatePresentation.description = "Show the TODO items of one filter of Settings, Editor, TODO."
        }

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun getChildren(event: AnActionEvent?): Array<AnAction> =
            (listOf(FilterAction("")) + TodoConfiguration.getInstance().todoFilters.map { FilterAction(it.name) })
                .toTypedArray()
    }

    private inner class FilterAction(private val name: String) :
        ToggleAction(if (name.isEmpty()) "Show All" else name) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun isSelected(event: AnActionEvent): Boolean = settings.todoFilterName == name

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            settings.todoFilterName = if (state) name else ""
            redraw()
        }
    }

    private inner class GroupByGroup : ActionGroup("Group By", true) {

        init {
            templatePresentation.icon = AllIcons.Actions.GroupBy
            templatePresentation.description = "Put a module row or a directory row above the files."
        }

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun getChildren(event: AnActionEvent?): Array<AnAction> =
            arrayOf(ModuleAction(), DirectoryAction(), FlattenAction())
    }

    private inner class ModuleAction : ToggleAction(
        "Group by Module",
        "Group the files under the module that holds them.",
        AllIcons.Actions.GroupByModule,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun isSelected(event: AnActionEvent): Boolean = settings.byModule

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            settings.byModule = state
            redraw()
        }
    }

    private inner class DirectoryAction : ToggleAction(
        "Group by Directory",
        "Show the directory tree above the files.",
        AllIcons.Actions.GroupByPackage,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun isSelected(event: AnActionEvent): Boolean = settings.byDirectory

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            settings.byDirectory = state
            redraw()
        }
    }

    private inner class FlattenAction : ToggleAction(
        "Flatten Directories",
        "Put the whole directory path on one row.",
        AllIcons.ObjectBrowser.FlattenPackages,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            super.update(event)
            event.presentation.isEnabled = settings.byDirectory
        }

        override fun isSelected(event: AnActionEvent): Boolean = settings.flattenDirectories

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            settings.flattenDirectories = state
            redraw()
        }
    }

    private inner class PreviewAction : ToggleAction(
        "Preview Source",
        "Show the source of the selected task beside the tree.",
        AllIcons.Actions.PreviewDetails,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun isSelected(event: AnActionEvent): Boolean = settings.showPreview

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            settings.showPreview = state
            showPreview(state)
        }
    }

    private inner class CheckAllAction :
        AnAction("Check All", "Check every task of the tree.", AllIcons.Actions.Selectall) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = allTasks().isNotEmpty()
        }

        override fun actionPerformed(event: AnActionEvent) {
            checks.set(allTasks(), true)
            afterCheck()
        }
    }

    private inner class ClearChecksAction :
        AnAction("Clear Checks", "Clear every check box.", AllIcons.Actions.Unselectall) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = checks.size > 0
        }

        override fun actionPerformed(event: AnActionEvent) {
            checks.clear()
            afterCheck()
        }
    }

    private inner class ResolveAction :
        AnAction("Resolve", "Mark the checked review comments as resolved.", AllIcons.Actions.Commit) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = resolveTargets().any { it.kind == TaskKind.COMMENT }
        }

        override fun actionPerformed(event: AnActionEvent) = resolveSelected()
    }

    private inner class SendAction : AnAction(
        "Send to the Agent",
        "Send the checked tasks to the agent.",
        AllIcons.Actions.Upload,
    ) {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            val target = target()
            event.presentation.text = target.text
            event.presentation.description = target.description
            event.presentation.isEnabled = target.scope != SendScope.NONE
        }

        override fun actionPerformed(event: AnActionEvent) = send()
    }

    companion object {
        private const val RELOAD_DELAY = 400

        private const val PLACE = "YReviewTasks"

        private const val PREVIEW_PROPORTION = "YReviewTasks.preview"

        private val logger = logger<ReviewTreePanel>()
    }
}
