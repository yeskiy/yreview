package com.yeskiy.yreview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.CommonActionsManager
import com.intellij.ide.CopyProvider
import com.intellij.ide.DataManager
import com.intellij.ide.DefaultTreeExpander
import com.intellij.ide.OccurenceNavigator
import com.intellij.ide.actions.NextOccurenceToolbarAction
import com.intellij.ide.actions.PreviousOccurenceToolbarAction
import com.intellij.ide.todo.TodoConfiguration
import com.intellij.ide.util.scopeChooser.ScopeChooserCombo
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.DataSink
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.UiDataProvider
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileTypes.FileTypeEvent
import com.intellij.openapi.fileTypes.FileTypeListener
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Condition
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.dvcs.repo.VcsRepositoryManager
import com.intellij.dvcs.repo.VcsRepositoryMappingListener
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.VcsMappingListener
import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.ChangeList
import com.intellij.openapi.vcs.changes.ChangeListListener
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.pom.Navigatable
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiTreeChangeAdapter
import com.intellij.psi.PsiTreeChangeEvent
import com.intellij.psi.search.IndexPatternProvider
import com.intellij.psi.search.SearchScope
import com.intellij.ui.AutoScrollToSourceHandler
import com.intellij.ui.CheckboxTreeHelper
import com.intellij.ui.OnePixelSplitter
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.content.Content
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.tree.TreeVisitor
import com.intellij.ui.treeStructure.Tree
import com.intellij.usageView.UsageInfo
import com.intellij.util.EditSourceOnDoubleClickHandler
import com.intellij.util.EditSourceOnEnterKeyHandler
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.tree.TreeUtil
import com.intellij.util.ui.update.MergingUpdateQueue
import com.intellij.util.ui.update.Update
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.bridge.PushFallback
import com.yeskiy.yreview.bridge.SendMessages
import com.yeskiy.yreview.bridge.SendPick
import com.yeskiy.yreview.bridge.SendPicks
import com.yeskiy.yreview.bridge.SendReport
import com.yeskiy.yreview.bridge.SendRoute
import com.yeskiy.yreview.bridge.SendRoutes
import com.yeskiy.yreview.bridge.SessionChoice
import com.yeskiy.yreview.diagnostic.Redact
import com.yeskiy.yreview.diagnostic.SessionLog
import com.yeskiy.yreview.diagnostic.SessionRecord
import com.yeskiy.yreview.handoff.CopyPrompt
import com.yeskiy.yreview.handoff.DoneWatch
import com.yeskiy.yreview.handoff.GitDir
import com.yeskiy.yreview.handoff.HandoffFiles
import com.yeskiy.yreview.handoff.HandoffPlace
import com.yeskiy.yreview.handoff.HandoffPrompt
import com.yeskiy.yreview.handoff.PromptFolder
import com.yeskiy.yreview.session.AgentCatalog
import com.yeskiy.yreview.session.AgentRows
import com.yeskiy.yreview.session.SessionReach
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.settings.grouping
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRoot
import com.yeskiy.yreview.store.ideGitRunner
import com.yeskiy.yreview.tasks.ChangeListFacts
import com.yeskiy.yreview.tasks.ChangeListScan
import com.yeskiy.yreview.tasks.ChangeListTab
import com.yeskiy.yreview.tasks.CheckState
import com.yeskiy.yreview.tasks.ClosePlan
import com.yeskiy.yreview.tasks.CloseReport
import com.yeskiy.yreview.tasks.RemoveReport
import com.yeskiy.yreview.tasks.RepositoryTasks
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.ScanState
import com.yeskiy.yreview.tasks.SendScope
import com.yeskiy.yreview.tasks.SendTarget
import com.yeskiy.yreview.tasks.SourceSignal
import com.yeskiy.yreview.tasks.TaskChecks
import com.yeskiy.yreview.tasks.TaskChoice
import com.yeskiy.yreview.tasks.TaskCompletion
import com.yeskiy.yreview.tasks.TaskDocument
import com.yeskiy.yreview.tasks.TaskFilter
import com.yeskiy.yreview.tasks.TaskKindFilter
import com.yeskiy.yreview.tasks.TaskLabels
import com.yeskiy.yreview.tasks.TaskLayout
import com.yeskiy.yreview.tasks.TaskRemoval
import com.yeskiy.yreview.tasks.TaskScan
import com.yeskiy.yreview.tasks.TaskScope
import com.yeskiy.yreview.tasks.TaskTree
import com.yeskiy.yreview.tasks.TodoRemoval
import com.yeskiy.yreview.tasks.TodoReport
import com.yeskiy.yreview.tasks.ToolbarFacts
import com.yeskiy.yreview.tasks.WriteTarget
import com.yeskiy.yreview.tasks.readScope
import com.yeskiy.yreview.ui.ReviewNotice
import java.awt.BorderLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.beans.PropertyChangeListener
import java.io.IOException
import java.nio.file.Path
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ToolTipManager
import javax.swing.tree.TreeSelectionModel

/** The tasks that went out, and the text the user pastes when the channel is out of reach. */
private data class SendOutcome(val report: SendReport, val clipboard: String?)

/**
 * The prompt one copy built, and the folders the plugin could not write.
 *
 * A folder in [unwritten] holds no task file and no done file, so the plugin closes no
 * task of that folder by itself. The prompt says so, and the notice names the folder.
 */
private data class CopyOutcome(val text: String, val tasks: Int, val folders: Int, val unwritten: List<String>)

/** The tasks the panel read, the rows they build after the filters run, and the local changes. */
private data class TreeContent(
    val repositories: List<RepositoryTasks>,
    val layout: TaskLayout,
    val changeList: ChangeListFacts,
)

/**
 * One tab of the review tool window, an enhanced TODO view.
 *
 * The tree holds the open tasks of the scope of the tab. A review comment comes from the git
 * notes. A TODO and a FIXME come from the same reader the built-in TODO view uses, and they
 * keep the icon and the color the user configured for their pattern.
 *
 * A narrow toolbar stands along the left edge, as the built-in view builds it. It groups by
 * module and by directory, it filters by kind and by TODO filter, it walks the rows one by
 * one, and it opens a preview beside the tree. Each tab keeps its own choices.
 *
 * Each row also carries a check box. The check box drives the send action, the resolve
 * action and the delete action, and the checked identifiers survive a reload of the tree.
 */
class ReviewTreePanel(private val project: Project, private val scope: TaskScope) :
    SimpleToolWindowPanel(false, true), Disposable, OccurenceNavigator {

    private val structure = TaskStructure(project)

    private val treeModel = StructureTreeModel(structure, this)

    /**
     * The answer of the tree to the copy key of the keymap.
     *
     * The bundled copy action reads this provider out of the data context, so the key the
     * user bound to a copy reaches the tree. No shortcut lives in this file.
     */
    private val treeCopy = object : CopyProvider {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun performCopy(dataContext: DataContext) = copy()

        override fun isCopyEnabled(dataContext: DataContext): Boolean =
            factsOf(dataContext).send.scope != SendScope.NONE

        override fun isCopyVisible(dataContext: DataContext): Boolean = true
    }

    private val tree = object : Tree(AsyncTreeModel(treeModel, this)), UiDataProvider {

        override fun uiDataSnapshot(sink: DataSink) = sink.set(PlatformDataKeys.COPY_PROVIDER, treeCopy)
    }

    private val queue = MergingUpdateQueue("y-review-tasks", RELOAD_DELAY, true, this, this, this)

    private val settings = ReviewSettings.getInstance(project)

    private val checks = TaskChecks()

    private val renderer = TaskCheckRenderer { holder -> checks.state(holder.tasks) }

    private val splitter = OnePixelSplitter(false, "$PREVIEW_PROPORTION.${scope.name}", 0.6f)

    private val loading = JBLoadingPanel(BorderLayout(), this, LOADING_DELAY)

    private val state = ScanState()

    private val preview = CommentPreviewPanel(project) { tab().showResolved }

    private val previewTicket = PreviewTicket()

    private val scopeChooser: ScopeChooserCombo? =
        if (scope == TaskScope.SCOPE_BASED) {
            ScopeChooserCombo(project, false, true, settings.tab(scope).scopeId)
        } else {
            null
        }

    private val autoScroll = object : AutoScrollToSourceHandler() {
        override fun isAutoScrollMode(): Boolean = tab().autoScrollToSource

        override fun setAutoScrollMode(state: Boolean) {
            tab().autoScrollToSource = state
        }
    }

    private val toolbar: ActionToolbar

    @Volatile
    private var repositories: List<RepositoryTasks> = emptyList()

    @Volatile
    private var changeList = ChangeListFacts()

    private var content: Content? = null

    @Volatile
    private var closed = false

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.setRowHeight(0)
        tree.selectionModel.selectionMode = TreeSelectionModel.DISCONTIGUOUS_TREE_SELECTION
        tree.cellRenderer = renderer
        TreeUIHelper.getInstance().installTreeSpeedSearch(tree)
        installChecks()
        EditSourceOnDoubleClickHandler.install(tree)
        EditSourceOnEnterKeyHandler.install(tree)
        autoScroll.install(tree)
        Disposer.register(this, preview)

        val expander = DefaultTreeExpander(tree)
        toolbar = ActionManager.getInstance().createActionToolbar(PLACE, toolbarGroup(expander), false)
        toolbar.targetComponent = tree
        setToolbar(toolbar.component)
        loading.add(ScrollPaneFactory.createScrollPane(tree, true), BorderLayout.CENTER)
        splitter.firstComponent = loading
        installScopeChooser()
        setContent(center())
        showPreview(tab().showPreview)
        PopupHandler.installPopupMenu(tree, menuGroup(expander), "YReviewTasksPopup")
        DeleteAction().registerCustomShortcutSet(CommonShortcuts.getDelete(), tree, this)
        // A tree shows the tooltip of a row only after this call. See JTree.getToolTipText.
        ToolTipManager.sharedInstance().registerComponent(tree)
        tree.addTreeSelectionListener { updatePreview() }

        subscribe()
        showState()
        BridgeService.getInstance(project).startLater()
        scheduleReload()
    }

    /**
     * Reads the scope again when the tab reaches the screen.
     *
     * A panel starts before the project holds its repositories, so the first read of a tab
     * that nobody opened yet can find none. The tab then names an empty scope, and only the
     * refresh button corrects it. A tab that reaches the screen therefore reads the scope
     * again.
     */
    override fun addNotify() {
        super.addNotify()
        scheduleReload()
    }

    override fun dispose() {
        closed = true
    }

    /** The tab that holds this panel. The changelist tab writes the list name on it. */
    fun attach(content: Content) {
        this.content = content
    }

    /**
     * The platform reads the selection here, so double click, Enter and the menu work.
     *
     * The record of the toolbar goes into the same snapshot. The platform builds one
     * snapshot for each expansion of a group, and it hands that snapshot to every button of
     * the group. One expansion therefore reads the tasks of the tree once, and not once for
     * each button.
     */
    override fun uiDataSnapshot(sink: DataSink) {
        super.uiDataSnapshot(sink)
        val chosen = selectedTasks()
        val files = chosen.mapNotNull { TaskNodes.find(it) }.distinct()
        if (files.isNotEmpty()) sink.set(CommonDataKeys.VIRTUAL_FILE_ARRAY, files.toTypedArray<VirtualFile>())
        val open = TreeUtil.collectSelectedObjectsOfType(tree, TaskNode::class.java) +
            TreeUtil.collectSelectedObjectsOfType(tree, FileNode::class.java)
        if (open.isNotEmpty()) sink.set(CommonDataKeys.NAVIGATABLE_ARRAY, open.toTypedArray<Navigatable>())
        sink.set(TOOLBAR_FACTS, toolbarFacts(chosen))
    }

    private fun tab(): ReviewSettings.TabState = settings.tab(scope)

    // --- The layout of the tab ---

    /** The Scope Based tab puts a scope chooser above the tree, as the built-in view does. */
    private fun center(): JComponent {
        val chooser = scopeChooser ?: return splitter
        return JPanel(BorderLayout()).apply {
            add(header(chooser), BorderLayout.NORTH)
            add(splitter, BorderLayout.CENTER)
        }
    }

    private fun header(chooser: ScopeChooserCombo): JComponent =
        JPanel(BorderLayout(JBUI.scale(GAP), 0)).apply {
            border = JBUI.Borders.empty(2, 4)
            add(JBLabel("Scope:").apply { labelFor = chooser }, BorderLayout.WEST)
            add(chooser, BorderLayout.CENTER)
        }

    private fun installScopeChooser() {
        val chooser = scopeChooser ?: return
        Disposer.register(this, chooser)
        chooser.setCurrentSelection(false)
        chooser.setUsageView(false)
        chooser.childComponent.addActionListener {
            tab().scopeId = chooser.selectedScopeId.orEmpty()
            redraw()
        }
    }

    /** The scope the user chose. The value is null on every tab but the Scope Based one. */
    private fun chosenScope(): SearchScope? = scopeChooser?.let {
        try {
            it.selectedScope
        } catch (failure: RuntimeException) {
            logger.warn("the review tool window could not read the chosen scope", failure)
            null
        }
    }

    // --- Reading the tasks ---

    private fun scheduleReload() {
        queue.queue(object : Update("reload") {
            override fun run() = reload()
        })
    }

    /**
     * Reads the tasks of the scope again.
     *
     * The read runs on a pooled thread, and it reports back once on every path. The tab
     * therefore leaves the loading state after a failure too, and not only after a result.
     */
    private fun reload() {
        val onlyFile = if (scope == TaskScope.CURRENT_FILE) openFile() else null
        val chosen = chosenScope()
        val ticket = state.start(DumbService.getInstance(project).isDumb)
        showState()
        ApplicationManager.getApplication().executeOnPooledThread {
            val outcome = readScope { scan(onlyFile, chosen) }
            outcome.failure?.let { logger.warn("the review tool window could not read the tasks", it) }
            ApplicationManager.getApplication().invokeLater({ settle(ticket, outcome.rows) }, expired())
        }
    }

    /** The rows of the scope, or null when the project went away before the read ended. */
    private fun scan(onlyFile: VirtualFile?, chosen: SearchScope?): TreeContent? {
        if (project.isDisposed) return null
        val changes = readChangeList()
        val found = TaskScan.read(project, onlyFile, tab().showResolved)
        return TreeContent(found, layoutOf(found, chosen, changes), changes)
    }

    /**
     * Closes one scan on the user interface thread.
     *
     * A scan of an older ticket writes nothing here, so it neither stops the spinner of a
     * newer scan nor draws its own rows over newer rows.
     */
    private fun settle(ticket: Long, content: TreeContent?) {
        if (!state.finish(ticket, content == null)) return
        if (content == null || project.isDisposed) showState() else show(content)
    }

    /** The panel stops its own spinner while it lives, whatever the project does. */
    private fun expired(): Condition<Any?> = Condition { closed }

    /** Puts the words of the phase on the empty tree, and runs the spinner while a scan is open. */
    private fun showState() {
        tree.emptyText.text = state.emptyText(finishedText())
        loading.setLoadingText(state.loadingText)
        if (state.loading) loading.startLoading() else loading.stopLoading()
    }

    /** The words a scan that ran to the end and found nothing leaves on the tree. */
    private fun finishedText(): String =
        if (scope == TaskScope.CHANGE_LIST) ChangeListTab.emptyText(changeList) else NO_TASK

    /** The changelist tab reads the local changes. Every other tab keeps the empty record. */
    private fun readChangeList(): ChangeListFacts {
        if (scope != TaskScope.CHANGE_LIST) return ChangeListFacts()
        return try {
            ChangeListScan.read(project)
        } catch (failure: RuntimeException) {
            logger.warn("the review tool window could not read the local changes", failure)
            ChangeListFacts()
        }
    }

    /**
     * A group change or a filter change needs no second read of git, so the tasks stay.
     *
     * A scope test reads the project index, and that read fails while the IDE builds the
     * index. The work therefore runs inside [readScope], as the work of [reload] does. The
     * tree then keeps the rows it holds, and the log keeps one line.
     */
    private fun redraw() {
        val found = repositories
        val chosen = chosenScope()
        val changes = changeList
        ApplicationManager.getApplication().executeOnPooledThread {
            if (project.isDisposed) return@executeOnPooledThread
            val outcome = readScope { TreeContent(found, layoutOf(found, chosen, changes), changes) }
            outcome.failure?.let { logger.warn("the review tool window could not build the rows", it) }
            outcome.rows?.let { publish(it) }
        }
    }

    private fun publish(content: TreeContent) =
        ApplicationManager.getApplication().invokeLater({ show(content) }, project.disposed)

    private fun show(content: TreeContent) {
        repositories = content.repositories
        changeList = content.changeList
        structure.layout = content.layout
        state.rows = content.layout.rows
        if (scope == TaskScope.CHANGE_LIST) nameTab(content.changeList)
        treeModel.invalidateAsync()
        toolbar.updateActionsAsync()
        updatePreview()
        showState()
    }

    /** The tab carries the name of the changelist it reads, as the bundled TODO window does. */
    private fun nameTab(facts: ChangeListFacts) {
        content?.let {
            it.displayName = ChangeListTab.tabTitle(facts)
            it.description = ChangeListTab.tabTooltip(facts)
        }
    }

    /**
     * Builds the rows of the tree. The caller runs it off the user interface thread, because
     * a scope test reads the project index.
     */
    private fun layoutOf(
        found: List<RepositoryTasks>,
        chosen: SearchScope?,
        changes: ChangeListFacts,
    ): TaskLayout {
        val several = found.size > 1
        return TaskTree.layout(
            TaskTree.group(
                inside(chosen, changes, TaskFilter.apply(found.flatMap { it.tasks }, filterRules(), kindFilter()))
            ) { label(it, several) },
            tab().grouping(),
        )
    }

    /**
     * The rows the tab keeps.
     *
     * The changelist tab drops every row whose file the changelist does not name. A chosen
     * scope drops every row outside it, and a null scope keeps every row.
     */
    private fun inside(chosen: SearchScope?, changes: ChangeListFacts, tasks: List<ReviewTask>): List<ReviewTask> {
        val kept = if (scope == TaskScope.CHANGE_LIST) ChangeListTab.keep(tasks, changes.files) else tasks
        if (chosen == null || kept.isEmpty()) return kept
        return ReadAction.nonBlocking<List<ReviewTask>> {
            kept.filter { task -> TaskNodes.find(task)?.let { chosen.contains(it) } == true }
        }.executeSynchronously()
    }

    /** A project with several repositories shows the repository name in front of the path. */
    private fun label(task: ReviewTask, several: Boolean): String =
        if (several) "${task.rootPath.substringAfterLast('/')}/${task.path}" else task.path

    private fun openFile() = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()

    private fun kindFilter(): TaskKindFilter = tab().kindFilter

    /** The rules of the chosen TODO filter. A null value means that no TODO filter is on. */
    private fun filterRules(): Set<String>? {
        if (tab().todoFilterName.isEmpty()) return null
        val filter = TodoConfiguration.getInstance().getTodoFilter(tab().todoFilterName) ?: return null
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

    /** What the buttons of the toolbar read. The tab walks the tasks of the tree once here. */
    private fun toolbarFacts(selected: List<ReviewTask>): ToolbarFacts {
        val all = allTasks()
        return ToolbarFacts.of(all, selected, checks.checkedOf(all), checks.size)
    }

    /** The record of the snapshot, or the empty record when the context carries none. */
    private fun factsOf(event: AnActionEvent): ToolbarFacts = factsOf(event.dataContext)

    private fun factsOf(context: DataContext): ToolbarFacts =
        TOOLBAR_FACTS.getData(context) ?: ToolbarFacts.EMPTY

    /** Where the send goes. A check box beats a row, and a row beats the whole tree. */
    private fun target(): SendTarget = toolbarFacts(selectedTasks()).send

    /** What a resolve or a delete acts on. Neither one falls back to the whole tree. */
    private fun writeTarget(): WriteTarget = toolbarFacts(selectedTasks()).write

    // --- Send ---

    /**
     * Hands the chosen tasks to an agent.
     *
     * The channel carries them when it is on and a session reads it. In every other case
     * the plugin writes the files of the file protocol and copies a short prompt instead.
     */
    private fun send() {
        val chosen = target().tasks
        if (chosen.isEmpty()) {
            ReviewNotice.warn(project, NO_TASK)
            return
        }
        val roots = chosen.map { it.rootPath }.distinct()
        if (roots.size > 1) {
            ReviewNotice.warn(project, "Select the tasks of one folder. This selection holds ${roots.size}.")
            return
        }
        val repository = repositories.firstOrNull { it.root.path == roots.single() }
        if (repository == null) {
            ReviewNotice.warn(project, "Read the tasks again, because the folder of the selection is gone.")
            return
        }
        val store = ReviewService.getInstance(project).storeAt(repository.root)
        when (val pick = pick(store)) {
            SendPick.None -> deliverTo(store, repository, chosen, null)
            is SendPick.One -> deliverTo(store, repository, chosen, pick.choice.key)
            is SendPick.Ask -> ask(pick) { deliverTo(store, repository, chosen, it.key) }
        }
    }

    /**
     * Which session this send can reach.
     *
     * The route decides first. A folder store, a closed channel switch, and an empty
     * bridge each send the tasks to the clipboard, and none of them can name a session.
     * This method therefore asks [SendRoutes] the same question the delivery asks, so the
     * words on the button and the work of the send can never disagree.
     *
     * The list of names comes from the reach of each session, and never from the open
     * stream set alone. A stream that the plugin did not start reaches no name here,
     * because only a session of this window can take a push.
     */
    private fun pick(store: StoreRoot?): SendPick {
        val bridge = BridgeService.getInstance(project)
        val route = SendRoutes.of(
            ReviewSettings.getInstance(project).channel,
            bridge.receiverCount(),
            store?.kind == StoreKind.GIT,
        )
        return SendPicks.of(bridge.liveChoices(), route == SendRoute.CHANNEL)
    }

    /**
     * The store of one selection, or null when the rows span two folders or name none.
     * A selection of two folders cannot go out in one send, so it names no store.
     */
    private fun storeOf(tasks: List<ReviewTask>): StoreRoot? {
        val root = tasks.map { it.rootPath }.distinct().singleOrNull() ?: return null
        val repository = repositories.firstOrNull { it.root.path == root } ?: return null
        return ReviewService.getInstance(project).storeAt(repository.root)
    }

    /**
     * Opens the list of sessions. The list stands where the user pressed, so the popup
     * follows the toolbar button and the context menu entry alike.
     */
    private fun ask(pick: SendPick.Ask, chosen: (SessionChoice) -> Unit) {
        JBPopupFactory.getInstance()
            .createPopupChooserBuilder(pick.choices)
            .setTitle("Send the Review Tasks To")
            .setRenderer(textListCellRenderer<SessionChoice> { it.name })
            .setItemChosenCallback { chosen(it) }
            .createPopup()
            .showInBestPositionFor(DataManager.getInstance().getDataContext(tree))
    }

    /** The progress window runs the send, because the send reads git and writes files. */
    private fun deliverTo(
        store: StoreRoot,
        repository: RepositoryTasks,
        tasks: List<ReviewTask>,
        target: String?,
    ) {
        finish(
            ProgressManager.getInstance().runProcessWithProgressSynchronously(
                ThrowableComputable<SendOutcome, RuntimeException> { deliver(store, repository, tasks, target) },
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

    /**
     * The caller reads the store, because the button reads it too. One store and one
     * route serve the words on the button and the work of the send.
     */
    private fun deliver(
        store: StoreRoot,
        repository: RepositoryTasks,
        tasks: List<ReviewTask>,
        target: String?,
    ): SendOutcome {
        val files = writeFiles(store, repository, tasks)
        val bridge = BridgeService.getInstance(project)
        val readers = bridge.readerCount()
        val route = SendRoutes.of(
            ReviewSettings.getInstance(project).channel,
            bridge.receiverCount(),
            store.kind == StoreKind.GIT,
        )
        val outcome = when {
            route == SendRoute.CHANNEL && bridge.reachOf(target) is SessionReach.LocalHttp && files != null -> {
                val prompt = HandoffPrompt.of(
                    GitDir.label(files.folder, Path.of(repository.root.path)),
                    repository.commit,
                    tasks,
                )
                PushFallback.of(bridge.pushText(checkNotNull(target), tasks.size, prompt), prompt)
                    .let { SendOutcome(it.report, it.clipboard) }
            }
            route == SendRoute.CHANNEL -> SendOutcome(bridge.sendTasks(repository.root, tasks, target), null)
            files == null -> SendOutcome(
                SendReport(0, 0, 0, "The plugin did not write the review files of ${repository.root.name}."),
                null,
            )
            else -> {
                val folder = GitDir.label(files.folder, Path.of(repository.root.path))
                SendOutcome(
                    SendReport(
                        tasks.size,
                        0,
                        0,
                        route = route,
                        folder = folder,
                        agentReason = AgentRows.sendReason(
                            AgentCatalog.of(ReviewSettings.getInstance(project).agentOrDefault())
                        ),
                    ),
                    HandoffPrompt.of(folder, repository.commit, tasks),
                )
            }
        }
        SessionLog.getInstance(project).record(SessionRecord.Send.of(outcome.report, store.kind, readers))
        return outcome
    }

    /**
     * The rules and the tasks go to the review folder on every send, whatever the route is.
     *
     * A git repository keeps that folder inside its git directory. A folder store has no
     * git directory, so it keeps the files beside its own records.
     */
    private fun writeFiles(store: StoreRoot, repository: RepositoryTasks, tasks: List<ReviewTask>): HandoffFiles? {
        val gitDir = if (store.kind == StoreKind.GIT) GitDir.of(ideGitRunner(project, store.root)) else null
        val folder = HandoffPlace.of(store.kind, Path.of(repository.root.path), gitDir) ?: return null
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
            logger.warn(
                "the review plugin did not write the task files",
                Redact.failure(failure, Redact.homes(), project.basePath),
            )
            SessionLog.getInstance(project).record(SessionRecord.Failure.of("write the task files", failure))
            null
        }
    }

    // --- Copy ---

    /**
     * Puts the chosen tasks in the clipboard, as a prompt an agent outside the IDE reads.
     *
     * The copy never takes the channel. It groups the tasks by repository, it writes the
     * files of the file protocol for every group, then it builds one prompt of every group.
     * A selection that spans two repositories therefore reaches one agent in one paste.
     */
    private fun copy() {
        val chosen = target().tasks
        if (chosen.isEmpty()) {
            ReviewNotice.warn(project, NO_TASK)
            return
        }
        report(
            ProgressManager.getInstance().runProcessWithProgressSynchronously(
                ThrowableComputable<CopyOutcome, RuntimeException> { collect(chosen) },
                "Copying the Review Tasks",
                true,
                project,
            )
        )
    }

    private fun report(outcome: CopyOutcome) {
        CopyPasteManager.copyTextToClipboard(outcome.text)
        val head = "The clipboard holds ${TaskLabels.count(outcome.tasks, "task")} of " +
            "${TaskLabels.count(outcome.folders, "folder")}."
        if (outcome.unwritten.isEmpty()) {
            ReviewNotice.say(project, head)
            return
        }
        ReviewNotice.warn(
            project,
            "$head The plugin wrote no task file for ${outcome.unwritten.joinToString(", ")}, " +
                "so it closes no task of that folder by itself. The prompt asks the agent to answer instead.",
        )
    }

    /**
     * Groups the tasks by repository and writes the files of every group.
     *
     * The order of the groups follows the tree, because [groupBy] keeps the key of the
     * first task of each group. This method reads git, so the caller runs it under a
     * progress window and off the user interface thread.
     */
    private fun collect(tasks: List<ReviewTask>): CopyOutcome {
        val folders = tasks.groupBy { it.rootPath }.map { (root, group) -> folderOf(root, group) }
        return CopyOutcome(
            CopyPrompt.of(folders),
            tasks.size,
            folders.size,
            folders.filter { !it.written }.map { it.name },
        )
    }

    /**
     * One group of the prompt.
     *
     * A repository that left the project between the scan and the copy keeps its tasks in
     * the prompt, because the work is still real. That group carries no path of a done
     * file, so the prompt asks the agent to name the finished identifiers in its answer.
     */
    private fun folderOf(root: String, tasks: List<ReviewTask>): PromptFolder {
        val repository = repositories.firstOrNull { it.root.path == root }
        val store = repository?.let { ReviewService.getInstance(project).storeAt(it.root) }
        val files = if (store == null) null else writeFiles(store, repository, tasks)
        return PromptFolder(
            store = store?.kind ?: StoreKind.GIT,
            name = root.substringAfterLast('/'),
            root = root,
            done = files?.done?.toString()?.replace('\\', '/').orEmpty(),
            commit = repository?.commit.orEmpty(),
            tasks = tasks,
            written = files != null,
        )
    }

    // --- Resolve ---

    private fun resolveSelected() {
        val chosen = writeTarget()
        if (!chosen.hasComments) {
            ReviewNotice.warn(project, "Check a review comment. $TODO_LIVES_IN_THE_SOURCE")
            return
        }
        val report = ProgressManager.getInstance().runProcessWithProgressSynchronously(
            ThrowableComputable<CloseReport, RuntimeException> {
                TaskCompletion.getInstance(project).close(chosen.comments.map { it.id }, ClosePlan.NO_CAP)
            },
            "Resolving the Review Comments",
            true,
            project,
        )
        val text = report.sentence(
            "The IDE resolved ${TaskLabels.count(report.closed, "comment")}. ${chosen.todoNotice}".trim(),
        )
        if (report.problem == null) ReviewNotice.say(project, text) else ReviewNotice.warn(project, text)
    }

    // --- Delete ---

    /**
     * Removes the chosen rows, whatever kind they are.
     *
     * A review comment goes out of the git notes, and the plugin keeps no copy of the
     * removed line. A TODO goes out of the source file, and one undo step puts it back.
     * The dialog names both counts before the work starts, and it asks once.
     */
    private fun deleteSelected() {
        val chosen = writeTarget()
        if (chosen.empty) {
            ReviewNotice.warn(project, "Check a review comment or a TODO item first.")
            return
        }
        val answer = Messages.showYesNoDialog(
            project,
            chosen.deleteQuestion,
            "Delete the Review Tasks",
            Messages.getWarningIcon(),
        )
        if (answer != Messages.YES) return
        report(deleteComments(chosen), deleteTodos(chosen))
    }

    /** A note write runs git, so it runs off the user interface thread under a progress. */
    private fun deleteComments(chosen: WriteTarget): RemoveReport? {
        if (chosen.comments.isEmpty()) return null
        return ProgressManager.getInstance().runProcessWithProgressSynchronously(
            ThrowableComputable<RemoveReport, RuntimeException> {
                TaskRemoval.getInstance(project).delete(chosen.comments.map { it.id })
            },
            "Deleting the Review Comments",
            true,
            project,
        )
    }

    /** A TODO delete writes a document, so it stays on the user interface thread. */
    private fun deleteTodos(chosen: WriteTarget): TodoReport? =
        if (chosen.todos.isEmpty()) null else TodoRemoval.getInstance(project).delete(chosen.todos)

    private fun report(comments: RemoveReport?, todos: TodoReport?) {
        val warnings = listOfNotNull(
            comments?.problem,
            comments?.takeIf { it.removed == 0 }?.let { "The git notes hold no line for that comment." },
            todos?.problem,
            missingNotice(todos),
        )
        val done = listOfNotNull(
            comments?.let { TaskLabels.count(it.removed, "review comment") },
            todos?.let { TaskLabels.count(it.removed, "TODO item") },
        ).joinToString(" and ")
        val text = "The IDE deleted $done. ${warnings.joinToString(" ")}".trim()
        if (warnings.isEmpty()) ReviewNotice.say(project, text) else ReviewNotice.warn(project, text)
    }

    /** The rows whose TODO the plugin did not find again, because the file changed under them. */
    private fun missingNotice(todos: TodoReport?): String? {
        val missing = todos?.missing.orEmpty()
        if (missing.isEmpty()) return null
        return "The plugin did not find ${TaskLabels.count(missing.size, "TODO item")}: " +
            "${missing.joinToString(", ")}. Read the tasks again."
    }

    // --- The preview ---

    private fun showPreview(state: Boolean) {
        splitter.secondComponent = if (state) preview.createComponent() else null
        if (state) updatePreview()
    }

    /**
     * A folder row and the root row carry every task under them, so the pane fills up too.
     *
     * The read of the store runs on a pooled thread, so a later read can answer first. Each
     * read takes a ticket, and only the answer of the newest ticket reaches the pane.
     */
    private fun updatePreview() {
        if (!tab().showPreview) return
        val ticket = previewTicket.start()
        val task = TaskChoice.previewTask(selectedTasks(), allTasks())
        if (task == null) {
            preview.showComment(null)
            preview.updateLayout(project, emptyList())
            return
        }
        ApplicationManager.getApplication().executeOnPooledThread {
            if (project.isDisposed) return@executeOnPooledThread
            val found = ReadAction.nonBlocking<List<UsageInfo>> { usages(task) }.executeSynchronously()
            val comment = CommentPreviewPanel.commentOf(project, task)
            ApplicationManager.getApplication().invokeLater({
                if (previewTicket.current(ticket)) {
                    preview.showComment(comment)
                    preview.updateLayout(project, found)
                }
            }, project.disposed)
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

    // --- The signals ---

    private fun subscribe() {
        val onProject = project.messageBus.connect(this)
        onProject.subscribe(REVIEW_COMMENTS, ReviewCommentListener { scheduleReload() })
        onProject.subscribe(ProjectLevelVcsManager.VCS_CONFIGURATION_CHANGED, VcsMappingListener { scheduleReload() })
        onProject.subscribe(VcsRepositoryManager.VCS_REPOSITORY_MAPPING_UPDATED, VcsRepositoryMappingListener { scheduleReload() })
        onProject.subscribe(TodoConfiguration.PROPERTY_CHANGE, PropertyChangeListener { scheduleReload() })
        onProject.subscribe(DumbService.DUMB_MODE, IndexWatch())
        if (scope == TaskScope.CURRENT_FILE) {
            onProject.subscribe(
                FileEditorManagerListener.FILE_EDITOR_MANAGER,
                object : FileEditorManagerListener {
                    override fun selectionChanged(event: FileEditorManagerEvent) = scheduleReload()
                },
            )
        }
        if (scope == TaskScope.CHANGE_LIST) {
            ChangeListManager.getInstance(project).addChangeListListener(ChangeListWatch(), this)
        }

        val onApplication = ApplicationManager.getApplication().messageBus.connect(this)
        onApplication.subscribe(IndexPatternProvider.INDEX_PATTERNS_CHANGED, PropertyChangeListener { scheduleReload() })
        onApplication.subscribe(
            FileTypeManager.TOPIC,
            object : FileTypeListener {
                override fun fileTypesChanged(event: FileTypeEvent) = scheduleReload()
            },
        )

        PsiManager.getInstance(project).addPsiTreeChangeListener(SourceWatch(), this)
    }

    // --- The toolbar and the menu ---

    private fun toolbarGroup(expander: DefaultTreeExpander): DefaultActionGroup {
        val common = CommonActionsManager.getInstance()
        return DefaultActionGroup(
            PreviousOccurenceToolbarAction(this),
            NextOccurenceToolbarAction(this),
            FilterGroup(),
            ResolvedAction(),
            GroupByGroup(),
            common.createExpandAllAction(expander, tree),
            common.createCollapseAllAction(expander, tree),
            autoScroll.createToggleAction(),
            PreviewAction(),
            Separator.getInstance(),
            RefreshAction(),
            CheckAllAction(),
            ClearChecksAction(),
            ResolveAction(),
            DeleteAction(),
            SendAction(),
            CopyAction(),
        )
    }

    private fun menuGroup(expander: DefaultTreeExpander): DefaultActionGroup {
        val manager = ActionManager.getInstance()
        val common = CommonActionsManager.getInstance()
        return DefaultActionGroup(
            listOfNotNull(
                SendAction(),
                CopyAction(),
                ResolveAction(),
                DeleteAction(),
                Separator.getInstance(),
                manager.getAction(IdeActions.ACTION_EDIT_SOURCE),
                Separator.getInstance(),
                common.createExpandAllAction(expander, tree),
                common.createCollapseAllAction(expander, tree),
                Separator.getInstance(),
                manager.getAction(IdeActions.GROUP_VERSION_CONTROLS),
                Separator.getInstance(),
                manager.getAction(COPY_DIAGNOSTICS),
            )
        )
    }

    /**
     * The signals of the index of the project.
     *
     * The TODO reader answers only in smart mode, so the tab names the index while the IDE
     * builds it. The tab reads the tasks again by itself after the index is complete.
     */
    private inner class IndexWatch : DumbService.DumbModeListener {

        override fun enteredDumbMode() = changePhase { state.enterIndexing() }

        override fun exitDumbMode() = changePhase {
            state.exitIndexing()
            scheduleReload()
        }
    }

    /** The phase and the spinner belong to the user interface thread, so every change goes there. */
    private fun changePhase(change: () -> Unit) =
        ApplicationManager.getApplication().invokeLater({
            change()
            showState()
        }, expired())

    /**
     * The signals of the source files.
     *
     * The tab reads its scope again for a change of a file, of a folder or of the source
     * roots. It reads the scope for no other signal, and the bundled TODO view draws the
     * same line. A signal that names no file tells the tab nothing about the tasks, and
     * [SourceSignal] holds the reason for each property the tab drops.
     */
    private inner class SourceWatch : PsiTreeChangeAdapter() {

        override fun childAdded(event: PsiTreeChangeEvent) = scheduleFor(event, event.child)

        override fun beforeChildRemoval(event: PsiTreeChangeEvent) = scheduleFor(event, event.child)

        override fun childMoved(event: PsiTreeChangeEvent) = scheduleFor(event, event.child)

        override fun childReplaced(event: PsiTreeChangeEvent) = scheduleFor(event, null)

        override fun childrenChanged(event: PsiTreeChangeEvent) = scheduleFor(event, null)

        override fun propertyChanged(event: PsiTreeChangeEvent) {
            if (SourceSignal.readAgain(event.propertyName)) scheduleReload()
        }

        /** A change inside a file, of a whole file or of a whole folder needs a new read. */
        private fun scheduleFor(event: PsiTreeChangeEvent, child: PsiElement?) {
            if (event.file != null || child is PsiFile || child is PsiDirectory) scheduleReload()
        }
    }

    /**
     * The signals of the local changes.
     *
     * The tab reloads when the user edits a file, moves a change or commits. The queue
     * puts the signals of one moment together, so a burst gives one read.
     */
    private inner class ChangeListWatch : ChangeListListener {

        override fun changeListUpdateDone() = scheduleReload()

        override fun changeListChanged(list: ChangeList?) = scheduleReload()

        override fun changesAdded(changes: Collection<Change>, toList: ChangeList?) = scheduleReload()

        override fun changesRemoved(changes: Collection<Change>, fromList: ChangeList?) = scheduleReload()

        override fun changesMoved(
            changes: Collection<Change>,
            fromList: ChangeList?,
            toList: ChangeList?,
        ) = scheduleReload()

        override fun defaultListChanged(oldDefaultList: ChangeList?, newDefaultList: ChangeList?) = scheduleReload()

        override fun changeListRenamed(list: ChangeList?, oldName: String?) = scheduleReload()

        override fun allChangeListsMappingsChanged() = scheduleReload()

        override fun changeListAvailabilityChanged() = scheduleReload()
    }

    private inner class RefreshAction :
        AnAction("Refresh", "Read the tasks of this scope again.", AllIcons.Actions.Refresh), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun actionPerformed(event: AnActionEvent) = scheduleReload()
    }

    /**
     * The two filters of the tree.
     *
     * The kind filter stands above the TODO filters of Settings, Editor, TODO. The two are
     * free of each other, and the button names both choices.
     */
    private inner class FilterGroup : ActionGroup("Filter", true), DumbAware {

        init {
            templatePresentation.icon = AllIcons.General.Filter
        }

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            event.presentation.text = "Filter: ${filterLabel()}"
            event.presentation.description = "The tree shows ${filterLabel()}. Click to change the filter."
        }

        override fun getChildren(event: AnActionEvent?): Array<AnAction> = (
            TaskKindFilter.entries.map { KindAction(it) } +
                Separator.create("TODO Filters") +
                FilterAction("") +
                TodoConfiguration.getInstance().todoFilters.map { FilterAction(it.name) }
            ).toTypedArray()
    }

    /** The words the filter button shows. They name the kind first and the TODO filter second. */
    private fun filterLabel(): String =
        if (tab().todoFilterName.isEmpty()) {
            kindFilter().label
        } else {
            "${kindFilter().label}, ${tab().todoFilterName}"
        }

    private inner class KindAction(private val kind: TaskKindFilter) :
        ToggleAction(kind.label, kind.summary, null), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun isSelected(event: AnActionEvent): Boolean = tab().kindFilter == kind

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().kindFilter = if (state) kind else TaskKindFilter.BOTH
            redraw()
        }
    }

    /**
     * The resolved switch of one tab.
     *
     * A resolved comment stays in the git notes, and the tree hides it. This switch brings
     * it back for a second pass over the review. The switch changes the scan, so the tab
     * reads the notes again and its count follows the switch.
     */
    private inner class ResolvedAction : ToggleAction(
        "Show Resolved Comments",
        "List the review comments that somebody already resolved.",
        AllIcons.Actions.Show,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun isSelected(event: AnActionEvent): Boolean = tab().showResolved

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().showResolved = state
            scheduleReload()
        }
    }

    private inner class FilterAction(private val name: String) :
        ToggleAction(if (name.isEmpty()) "Show All TODO Items" else name), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun isSelected(event: AnActionEvent): Boolean = tab().todoFilterName == name

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().todoFilterName = if (state) name else ""
            redraw()
        }
    }

    private inner class GroupByGroup : ActionGroup("Group By", true), DumbAware {

        init {
            templatePresentation.icon = AllIcons.Actions.GroupBy
            templatePresentation.description = "Put a module row or a directory row above the files."
        }

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun getChildren(event: AnActionEvent?): Array<AnAction> =
            arrayOf(ModuleAction(), DirectoryAction(), FlattenAction())
    }

    private inner class ModuleAction : ToggleAction(
        "Group by Module",
        "Group the files under the module that holds them.",
        AllIcons.Actions.GroupByModule,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun isSelected(event: AnActionEvent): Boolean = tab().byModule

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().byModule = state
            redraw()
        }
    }

    private inner class DirectoryAction : ToggleAction(
        "Group by Directory",
        "Show the directory tree above the files.",
        AllIcons.Actions.GroupByPackage,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun isSelected(event: AnActionEvent): Boolean = tab().byDirectory

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().byDirectory = state
            redraw()
        }
    }

    private inner class FlattenAction : ToggleAction(
        "Flatten Directories",
        "Put the whole directory path on one row.",
        AllIcons.ObjectBrowser.FlattenPackages,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            super.update(event)
            event.presentation.isEnabled = tab().byDirectory
        }

        override fun isSelected(event: AnActionEvent): Boolean = tab().flattenDirectories

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().flattenDirectories = state
            redraw()
        }
    }

    private inner class PreviewAction : ToggleAction(
        "Preview Source",
        "Show the source of the selected task beside the tree.",
        AllIcons.Actions.PreviewDetails,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun isSelected(event: AnActionEvent): Boolean = tab().showPreview

        override fun setSelected(event: AnActionEvent, state: Boolean) {
            tab().showPreview = state
            showPreview(state)
        }
    }

    private inner class CheckAllAction :
        AnAction("Check All", "Check every task of the tree.", AllIcons.Actions.Selectall), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = factsOf(event).anyTask
        }

        override fun actionPerformed(event: AnActionEvent) {
            checks.set(allTasks(), true)
            afterCheck()
        }
    }

    private inner class ClearChecksAction :
        AnAction("Clear Checks", "Clear every check box.", AllIcons.Actions.Unselectall), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = factsOf(event).anyCheck
        }

        override fun actionPerformed(event: AnActionEvent) {
            checks.clear()
            afterCheck()
        }
    }

    private inner class ResolveAction :
        AnAction("Resolve", "Mark the checked review comments as resolved.", AllIcons.Actions.Commit), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = factsOf(event).write.hasComments
        }

        override fun actionPerformed(event: AnActionEvent) = resolveSelected()
    }

    private inner class DeleteAction : AnAction(
        "Delete",
        "Remove the checked review comments from the git notes, and the checked TODO items from the source.",
        AllIcons.General.Delete,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            event.presentation.isEnabled = !factsOf(event).write.empty
        }

        override fun actionPerformed(event: AnActionEvent) = deleteSelected()
    }

    private inner class SendAction : AnAction(
        "Send to the Agent",
        "Send the checked tasks to the agent.",
        AllIcons.Actions.Upload,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            val target = factsOf(event).send
            val sendable = target.scope != SendScope.NONE
            event.presentation.text = SendPicks.buttonText(target.text, pick(storeOf(target.tasks)), sendable)
            event.presentation.description = target.description
            event.presentation.isEnabled = sendable
        }

        override fun actionPerformed(event: AnActionEvent) = send()
    }

    /**
     * The copy button of the toolbar.
     *
     * The button stays on the toolbar at every moment. A tree with no open task disables
     * it, and the button then says what it would copy.
     */
    private inner class CopyAction : AnAction(
        "Copy for an Agent",
        "Copy the checked tasks to the clipboard, as a prompt for an agent.",
        AllIcons.Actions.Copy,
    ), DumbAware {

        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(event: AnActionEvent) {
            val target = factsOf(event).send
            event.presentation.text = target.copyText
            event.presentation.description = target.copyDescription
            event.presentation.isVisible = true
            event.presentation.isEnabled = target.scope != SendScope.NONE
        }

        override fun actionPerformed(event: AnActionEvent) = copy()
    }

    companion object {
        /**
         * The record every button of the toolbar reads while it draws itself.
         *
         * The panel writes the record on the user interface thread, inside the snapshot of
         * the data context. Each button reads it on a background thread, so no button holds
         * the user interface thread while the toolbar opens.
         */
        private val TOOLBAR_FACTS: DataKey<ToolbarFacts> = DataKey.create("y.review.toolbar.facts")

        private const val RELOAD_DELAY = 400

        // The bundled TODO window waits the same time before it paints its spinner.
        private const val LOADING_DELAY = 1000

        private const val GAP = 6

        private const val NO_TASK = "This scope has no open review task."

        private const val PLACE = "YReviewTasks"

        /** The descriptor registers this action, and the popup menu of the tree shows it. */
        private const val COPY_DIAGNOSTICS = "com.yeskiy.yreview.CopyDiagnostics"

        private const val PREVIEW_PROPORTION = "YReviewTasks.preview"

        private const val TODO_LIVES_IN_THE_SOURCE = "A TODO lives in the source file and not in a note."

        private val logger = logger<ReviewTreePanel>()
    }
}
