package com.yeskiy.yreview.bench

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.changes.ChangeListManagerImpl
import com.intellij.openapi.vcs.impl.ProjectLevelVcsManagerImpl
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.psi.search.PsiTodoSearchHelper
import com.intellij.testFramework.HeavyPlatformTestCase
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.Processor
import com.intellij.util.ui.tree.TreeUtil
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.ProcessGitRunner
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.ideGitRunner
import com.yeskiy.yreview.tasks.ChangeListFacts
import com.yeskiy.yreview.tasks.ChangeListScan
import com.yeskiy.yreview.tasks.NoteScan
import com.yeskiy.yreview.tasks.PlacedComments
import com.yeskiy.yreview.tasks.RepositoryTasks
import com.yeskiy.yreview.tasks.ScanPhase
import com.yeskiy.yreview.tasks.ScanState
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TaskScan
import com.yeskiy.yreview.tasks.TaskScope
import com.yeskiy.yreview.toolwindow.CommentPreviewPanel
import com.yeskiy.yreview.toolwindow.ReviewTreePanel
import com.intellij.openapi.application.ReadAction
import git4idea.repo.GitRepositoryManager
import com.intellij.dvcs.repo.VcsRepositoryManager
import com.intellij.dvcs.repo.VcsRepositoryMappingListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.VcsMappingListener
import com.intellij.openapi.vcs.changes.ChangeListListener
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiTreeChangeAdapter
import com.intellij.psi.PsiTreeChangeEvent
import com.yeskiy.yreview.store.REVIEW_COMMENTS
import com.yeskiy.yreview.store.ReviewCommentListener
import com.yeskiy.yreview.tasks.SourceSignal
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.SwingUtilities

/** The median and the max of a few runs, in milliseconds. */
private data class Spread(val median: Double, val max: Double, val runs: List<Double>) {
    override fun toString(): String = "median %.1f ms, max %.1f ms, runs %s".format(median, max, runs.joinToString { "%.0f".format(it) })
}

private fun spread(values: List<Double>): Spread = values.sorted().let { Spread(it[it.size / 2], it.last(), values) }

private fun millis(nanos: Long): Double = nanos / 1_000_000.0

/** Posts an empty event to the user interface thread every 2 ms, and keeps the wait of each event. */
private class EdtProbe : Thread("y-review bench edt probe") {

    @Volatile
    private var running = true

    private val lags = mutableListOf<Long>()

    init {
        isDaemon = true
    }

    override fun run() {
        while (running) {
            val posted = System.nanoTime()
            val done = CountDownLatch(1)
            SwingUtilities.invokeLater {
                synchronized(lags) { lags += System.nanoTime() - posted }
                done.countDown()
            }
            done.await(60, TimeUnit.SECONDS)
            sleep(2)
        }
    }

    /** The longest wait, and the sum of the waits of 10 ms and more, in milliseconds. */
    fun finish(): Pair<Double, Double> {
        running = false
        join()
        return synchronized(lags) { millis(lags.maxOrNull() ?: 0) to millis(lags.filter { it >= 10_000_000 }.sum()) }
    }
}

/** One open of the tool window, from the content creation to quiet. */
private data class OpenRun(
    val construct: Double,
    val firstShow: Double,
    val firstRow: Double,
    val reloads: Long,
    val edtMaxLag: Double,
    val edtBlocked: Double,
    val git: List<TracedGit>,
    val settled: Boolean,
    val signals: Map<String, Int>,
    val scans: Int,
)

/** Counts the signals that the panel listens to, with the same filters as the panel. */
private class Signals(project: Project, parent: Disposable) {

    private val counts = ConcurrentHashMap<String, AtomicInteger>()

    private fun hit(name: String) {
        counts.getOrPut(name) { AtomicInteger() }.incrementAndGet()
    }

    init {
        val bus = project.messageBus.connect(parent)
        bus.subscribe(REVIEW_COMMENTS, ReviewCommentListener { hit("REVIEW_COMMENTS") })
        bus.subscribe(ProjectLevelVcsManager.VCS_CONFIGURATION_CHANGED, VcsMappingListener { hit("VCS_CONFIGURATION_CHANGED") })
        bus.subscribe(VcsRepositoryManager.VCS_REPOSITORY_MAPPING_UPDATED, VcsRepositoryMappingListener { hit("VCS_REPOSITORY_MAPPING_UPDATED") })
        bus.subscribe(
            DumbService.DUMB_MODE,
            object : DumbService.DumbModeListener {
                override fun exitDumbMode() = hit("exitDumbMode")
            },
        )
        bus.subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(source: FileEditorManager, file: VirtualFile) = hit("fileOpened ${file.name}")

                override fun fileClosed(source: FileEditorManager, file: VirtualFile) = hit("fileClosed ${file.name}")
            },
        )
        ChangeListManager.getInstance(project).addChangeListListener(
            object : ChangeListListener {
                override fun changeListUpdateDone() = hit("changeListUpdateDone")
            },
            parent,
        )
        PsiManager.getInstance(project).addPsiTreeChangeListener(
            object : PsiTreeChangeAdapter() {
                override fun childAdded(event: PsiTreeChangeEvent) = psi("childAdded", event, event.child)

                override fun beforeChildRemoval(event: PsiTreeChangeEvent) = psi("beforeChildRemoval", event, event.child)

                override fun childMoved(event: PsiTreeChangeEvent) = psi("childMoved", event, event.child)

                override fun childReplaced(event: PsiTreeChangeEvent) = psi("childReplaced", event, null)

                override fun childrenChanged(event: PsiTreeChangeEvent) = psi("childrenChanged", event, null)

                override fun propertyChanged(event: PsiTreeChangeEvent) {
                    if (SourceSignal.readAgain(event.propertyName)) hit("psi propertyChanged ${event.propertyName}")
                }
            },
            parent,
        )
    }

    private fun psi(kind: String, event: PsiTreeChangeEvent, child: PsiElement?) {
        if (event.file != null || child is PsiFile || child is PsiDirectory) hit("psi $kind ${event.file?.name ?: child?.toString()}")
    }

    fun snapshot(): Map<String, Int> = counts.mapValues { it.value.get() }.toSortedMap()
}

/**
 * Measures where the review tool window spends its time on a big fixture.
 * The run is off unless YREVIEW_BENCH=1, and it writes its numbers to build/bench/idea-load.txt.
 */
class ToolWindowLoadBench : HeavyPlatformTestCase() {

    private lateinit var base: File

    private lateinit var fixture: BenchFixture

    private val lines = mutableListOf<String>()

    private val trace = GitTrace.fromEnv()

    override fun shouldRunTest(): Boolean = System.getenv("YREVIEW_BENCH") == "1" && super.shouldRunTest()

    override fun runInDispatchThread(): Boolean = false

    override fun setUp() {
        super.setUp()
        base = Files.createTempDirectory("y-review-bench").toFile()
        // The TODO index reads the jars of the sandbox, and a heavy test allows only the listed roots.
        VfsRootAccess.allowRootAccess(testRootDisposable, System.getProperty("user.dir"))
        (ProjectLevelVcsManager.getInstance(project) as ProjectLevelVcsManagerImpl).waitForInitialized()
    }

    override fun tearDown() {
        // The base class clears every field of the test in its tear down, so the folder stays in a local value.
        val dir = base
        try {
            runInEdtAndWait { FileEditorManager.getInstance(project).openFiles.forEach { FileEditorManager.getInstance(project).closeFile(it) } }
            ReviewService.getInstance(project).homeOverride = null
            ChangeListManagerImpl.getInstanceImpl(project).waitEverythingDoneAndStopInTestMode()
        } finally {
            runInEdtAndWait { super.tearDown() }
            dir.deleteRecursively()
        }
    }

    private fun say(line: String) {
        lines += line
        println("[bench] $line")
        write()
    }

    private fun write() {
        val out = File(System.getProperty("user.dir"), "build/bench/idea-load.txt")
        out.parentFile.mkdirs()
        out.writeText(lines.joinToString("\n", postfix = "\n"))
    }

    private fun measure(name: String, warmup: Int = 1, runs: Int = 5, before: () -> Unit = {}, block: () -> Unit): Spread {
        repeat(warmup) {
            before()
            block()
        }
        val values = (1..runs).map {
            before()
            val start = System.nanoTime()
            block()
            millis(System.nanoTime() - start)
        }
        return spread(values).also { say("$name: $it") }
    }

    private fun coldCaches() {
        NoteScan.forget()
        DiffCache.forget()
    }

    private fun gitOf(block: () -> Unit): String {
        val mark = trace?.mark() ?: return "no GIT_TRACE2_EVENT"
        block()
        return GitTrace.summary(trace.since(mark))
    }

    // --- The fixture ---

    private fun buildProject(): VirtualFile {
        val start = System.nanoTime()
        fixture = BenchFixture(base).also { it.build() }
        say("fixture built in %.1f s".format(millis(System.nanoTime() - start) / 1000))
        ReviewSettings.getInstance(project).channel = false
        ReviewService.getInstance(project).homeOverride = fixture.home.path
        return fixture.mapInto(project, module)
    }

    // --- The benchmark ---

    fun testLoad() {
        val root = buildProject()
        say("git trace: ${trace?.let { "on" } ?: "off, set GIT_TRACE2_EVENT to count the git processes"}")
        say("repositories: ${GitRepositoryManager.getInstance(project).repositories.map { it.root.name }}")
        val found = TaskScan.read(project, null)
        found.forEach { entry ->
            say("store ${entry.root.name} outside=${entry.outside}: ${entry.tasks.count { it.kind == TaskKind.COMMENT }} comments, " +
                "${entry.tasks.count { it.kind == TaskKind.TODO }} TODO")
        }
        gitSpawn(root)
        parts(root, found)
        panelOpen(preview = false)
        panelOpen(preview = true)
        commentChange(root, preview = false)
        commentChange(root, preview = true)
        newCases(root)
    }

    private fun gitSpawn(root: VirtualFile) {
        val raw = ProcessGitRunner(File(root.path), checkCanceled = {})
        measure("one git process from the JVM (git --version)", warmup = 3, runs = 21) { raw.run("--version") }
        val ide = ideGitRunner(project, root)
        measure("one git process through ideGitRunner (rev-parse HEAD)", warmup = 3, runs = 21) { ide.run("rev-parse", "HEAD") }
    }

    private fun parts(root: VirtualFile, found: List<RepositoryTasks>) {
        say("--- TaskScan.read and its parts ---")
        measure("TaskScan.read, warm caches") { TaskScan.read(project, null) }
        say("  git per warm TaskScan.read: ${gitOf { TaskScan.read(project, null) }}")
        measure("TaskScan.read, cold note and diff caches", before = ::coldCaches) { TaskScan.read(project, null) }
        coldCaches()
        say("  git per cold TaskScan.read: ${gitOf { TaskScan.read(project, null) }}")
        measure("TaskScan.read, current file only") { TaskScan.read(project, vfs(File(fixture.repo, fixture.sourceFiles[0]))) }

        val counting = CountingGit(ProcessGitRunner(File(root.path), checkCanceled = {}))
        val head = GitRepositoryManager.getInstance(project).getRepositoryForRoot(root)!!.currentRevision
        measure("NoteScan.read, cold cache", before = ::coldCaches) { NoteScan.read(counting, root.path) }
        coldCaches()
        counting.reset()
        val snapshot = NoteScan.read(counting, root.path)!!
        say("  cold NoteScan: ${counting.summary()}")
        counting.reset()
        measure("NoteScan.read, warm cache") { NoteScan.read(counting, root.path) }
        say("  6 warm NoteScan: ${counting.summary()}")

        measure("PlacedComments.of, cold diff cache", before = DiffCache::forget) { PlacedComments.of(counting, root.path, head, null, snapshot) }
        DiffCache.forget()
        counting.reset()
        val placed = PlacedComments.of(counting, root.path, head, null, snapshot)
        say("  cold placement of ${placed.size} comments: ${counting.summary()}")
        counting.reset()
        measure("PlacedComments.of, warm diff cache") { PlacedComments.of(counting, root.path, head, null, snapshot) }
        say("  6 warm placements: ${counting.summary()}")

        val roots = GitRepositoryManager.getInstance(project).repositories.map { it.root.path }
        val commit = head.orEmpty()
        measure("TODO search (todos, processFilesWithTodoItems)") { TaskScan.todos(project, root, roots, commit, null) }
        measure("TODO file list only (processFilesWithTodoItems, no item read)") {
            ReadAction.nonBlocking<Int> {
                var count = 0
                PsiTodoSearchHelper.getInstance(project).processFilesWithTodoItems(Processor { count++; true })
                count
            }.executeSynchronously()
        }
        measure("comments (placedTasks with NoteScan, ideGitRunner)") {
            TaskScan.comments(project, root, head, null, false)
        }
        val all = found.flatMap { it.tasks }
        measure("withModules over ${all.size} tasks") { TaskScan.withModules(project, all) }
        measure("folderTasks (store roots, folder notes)") { TaskScan.folderTasks(project, null, false) }
        measure("ReviewService.storeRoots") { ReviewService.getInstance(project).storeRoots() }
        measure("outsideTasks (1 open outside file)") { TaskScan.outsideTasks(project, roots, null, false) }
        say("  git per outsideTasks: ${gitOf { TaskScan.outsideTasks(project, roots, null, false) }}")
        measure("ChangeListScan.read") { ChangeListScan.read(project) }

        val panel = runInEdtAndGet { ReviewTreePanel(project, TaskScope.PROJECT).also { Disposer.register(testRootDisposable, it) } }
        measure("layoutOf (filter, group, tree layout) over ${all.size} tasks") { panel.layoutOf(found, null, ChangeListFacts()) }
        measure("panel scan (TaskScan.read, change list, layout)") { panel.scan(null, null) }
        val content = panel.scan(null, null)!!
        measure("show on the EDT (model swap, toolbar, preview)") { runInEdtAndWait { panel.show(content) } }
        rendering(panel)
        runInEdtAndWait { Disposer.dispose(panel) }
    }

    private fun rendering(panel: ReviewTreePanel) {
        val tree = panel.tree
        val expand = System.nanoTime()
        runInEdtAndGet { TreeUtil.promiseExpandAll(tree) }.blockingGet(120_000)
        say("expand every row (AsyncTreeModel build): %.1f ms".format(millis(System.nanoTime() - expand)))
        val rows = runInEdtAndGet { tree.rowCount }
        measure("renderer over all $rows rows on the EDT") {
            runInEdtAndWait {
                (0 until tree.rowCount).forEach { row ->
                    val path = tree.getPathForRow(row)
                    tree.cellRenderer.getTreeCellRendererComponent(
                        tree, path.lastPathComponent, false, tree.isExpanded(row), tree.model.isLeaf(path.lastPathComponent), row, false,
                    )
                }
            }
        }
    }

    // --- The open of the tool window ---

    private fun tasksOf(panel: ReviewTreePanel): Int = panel.repositories.sumOf { it.tasks.size }

    private fun activate(panel: ReviewTreePanel) = runInEdtAndWait { panel.queue.showNotify() }

    private fun waitFor(timeoutMillis: Long = 120_000, test: () -> Boolean): Long {
        val start = System.nanoTime()
        while (!test()) {
            check(System.nanoTime() - start < timeoutMillis * 1_000_000) { "the bench waited too long" }
            Thread.sleep(2)
        }
        return System.nanoTime()
    }

    /** Waits until the ticket stays the same for [quietMillis], and gives false after [maxMillis] without quiet. */
    private fun quiet(state: ScanState, quietMillis: Long = 2000, maxMillis: Long = 10_000): Boolean {
        val start = System.nanoTime()
        var last = state.ticket
        var since = System.nanoTime()
        while (System.nanoTime() - since < quietMillis * 1_000_000 || state.phase != ScanPhase.READY) {
            if (System.nanoTime() - start > maxMillis * 1_000_000) return false
            Thread.sleep(20)
            val now = state.ticket
            if (now != last) {
                last = now
                since = System.nanoTime()
            }
        }
        return true
    }

    private fun panels(): Map<TaskScope, ReviewTreePanel> = runInEdtAndGet { TaskScope.entries.associateWith { ReviewTreePanel(project, it) } }

    /**
     * The factory makes one panel per scope, and the platform shows the selected tab only.
     * With [switchTo], the [shown] tab gets quiet first, and the times start at the activation of [switchTo].
     */
    private fun open(shown: TaskScope, switchTo: TaskScope? = null): OpenRun {
        val ready = switchTo?.let {
            panels().also { early ->
                val first = early.getValue(shown)
                activate(first)
                waitFor { first.state.phase == ScanPhase.READY && first.state.rows > 0 }
                if (!quiet(first.state)) say("  the $shown tab did not settle in 10 s before the switch")
            }
        }
        val mark = trace?.mark()
        val scans = TaskScan.reads.get()
        val probe = EdtProbe().apply { start() }
        val listening = Disposer.newDisposable()
        val signals = Signals(project, listening)
        val start = System.nanoTime()
        val panels = ready ?: panels()
        val built = System.nanoTime()
        val panel = panels.getValue(switchTo ?: shown)
        activate(panel)
        val state = panel.state
        val tree = panel.tree
        val showAt = waitFor { state.phase == ScanPhase.READY && state.rows > 0 }
        val rowAt = waitFor { runInEdtAndGet { tree.rowCount } > 0 }
        val settled = quiet(state)
        val (maxLag, blocked) = probe.finish()
        val git = mark?.let { trace!!.since(it) }.orEmpty()
        val reloads = state.ticket
        val reads = TaskScan.reads.get() - scans
        runInEdtAndWait {
            panels.values.forEach { Disposer.dispose(it) }
            Disposer.dispose(listening)
        }
        return OpenRun(
            millis(built - start), millis(showAt - start), millis(rowAt - start), reloads, maxLag, blocked, git, settled, signals.snapshot(), reads,
        )
    }

    private fun report(name: String, runs: List<OpenRun>) {
        say("$name, content creation of 4 panels: ${spread(runs.map { it.construct })}")
        say("$name, creation to first rows in the model (settle, show): ${spread(runs.map { it.firstShow })}")
        say("$name, creation to first visible tree row: ${spread(runs.map { it.firstRow })}")
        say("$name, longest EDT wait: ${spread(runs.map { it.edtMaxLag })}")
        say("$name, EDT waits of 10 ms and more, summed: ${spread(runs.map { it.edtBlocked })}")
        say("$name, reloads per open: ${runs.map { it.reloads }}, settled in 10 s: ${runs.map { it.settled }}")
        say("$name, signals per open: ${runs.map { it.signals }}")
        runs.lastOrNull()?.let { say("$name, git of the last open: ${GitTrace.summary(it.git)}") }
    }

    /** The preview pane is on by default. [preview] false shows the cost without the preview card. */
    private fun showPreview(preview: Boolean) =
        TaskScope.entries.forEach { ReviewSettings.getInstance(project).tab(it).showPreview = preview }

    private fun panelOpen(preview: Boolean) {
        showPreview(preview)
        val tag = if (preview) "preview on" else "preview off"
        say("--- tool window open, Project tab shown, $tag (the queue flushes at once when the tab shows) ---")
        open(TaskScope.PROJECT)
        report("warm open, $tag", (1..5).map { open(TaskScope.PROJECT) })
        report("cold open, $tag", (1..5).map {
            coldCaches()
            open(TaskScope.PROJECT)
        })
        report("warm open, Changelist tab, $tag", (1..5).map { open(TaskScope.CHANGE_LIST) })
    }

    // --- One comment changes ---

    private fun commentChange(root: VirtualFile, preview: Boolean) {
        showPreview(preview)
        say("--- reload after one comment change, preview ${if (preview) "on" else "off"} ---")
        val panel = runInEdtAndGet { ReviewTreePanel(project, TaskScope.PROJECT).also { Disposer.register(testRootDisposable, it) } }
        activate(panel)
        val state = panel.state
        waitFor { state.phase == ScanPhase.READY && state.rows > 0 }
        if (!quiet(state)) say("  the panel did not settle in 10 s before the comment changes")
        val service = ReviewService.getInstance(project)
        val head = GitRepositoryManager.getInstance(project).getRepositoryForRoot(root)!!.currentRevision!!
        val path = fixture.sourceFiles[1]
        val writes = mutableListOf<Double>()
        val reloads = mutableListOf<Double>()
        val tickets = mutableListOf<Long>()
        val gits = mutableListOf<String>()
        (0 until 6).forEach { n ->
            val before = state.ticket
            val count = tasksOf(panel)
            val mark = trace?.mark()
            val start = System.nanoTime()
            service.addComment(root, NoteRefs.LOCAL, head, path, Range(startLine = 3 + n, endLine = 3 + n), "changed comment $n")
            val written = System.nanoTime()
            val settled = waitFor { state.ticket > before && state.phase == ScanPhase.READY && tasksOf(panel) > count }
            if (!quiet(state)) say("  comment change $n did not settle in 10 s")
            if (n > 0) {
                writes += millis(written - start)
                reloads += millis(settled - written)
                tickets += state.ticket - before
                mark?.let { gits += GitTrace.summary(trace!!.since(it)) }
            }
        }
        say("addComment (write, share step): ${spread(writes)}")
        say("write end to new rows (RELOAD_DELAY 400 ms included): ${spread(reloads)}")
        say("reloads per comment change: $tickets")
        gits.lastOrNull()?.let { say("git per comment change, write and reload: $it") }
        measure("TaskScan.read after one note change (one moved ref)", before = {
            service.addComment(root, NoteRefs.LOCAL, head, path, Range(startLine = 10, endLine = 10), "direct ${System.nanoTime()}")
        }) { TaskScan.read(project, null) }
        runInEdtAndWait { Disposer.dispose(panel) }
    }

    // --- Cases for the load plan ---

    private fun newCases(root: VirtualFile) {
        say("--- cases for the load plan ---")
        val head = GitRepositoryManager.getInstance(project).getRepositoryForRoot(root)!!.currentRevision!!
        val service = ReviewService.getInstance(project)
        say("addComment git: ${gitOf {
            service.addComment(root, NoteRefs.LOCAL, head, fixture.sourceFiles[2], Range(startLine = 2, endLine = 2), "count ${System.nanoTime()}")
        }}")
        val task = TaskScan.read(project, null).flatMap { it.tasks }.first { it.kind == TaskKind.COMMENT && !it.outside }
        measure("preview record (commentOf)") { CommentPreviewPanel.commentOf(project, task) }
        say("  git per preview record: ${gitOf { CommentPreviewPanel.commentOf(project, task) }}")
        val raw = ProcessGitRunner(File(root.path), checkCanceled = {})
        // A file keeps the quotes of the record, which a Windows command line can lose.
        val note = File(base, "outside-note.txt")
        val outsideWrite = {
            note.writeText(fixture.outsideNote(fixture.sourceFiles[3]) + "\n")
            raw.run("notes", "--ref", NoteRefs.LOCAL, "append", "-F", note.absolutePath, head).let { check(it.ok) { it.stderr } }
        }
        measure("TaskScan.read after an outside note write", before = outsideWrite) { TaskScan.read(project, null) }
        say("  git per scan after an outside note write: ${gitOf {
            outsideWrite()
            TaskScan.read(project, null)
        }}")
        val switches = (1..5).map { open(TaskScope.PROJECT, switchTo = TaskScope.CHANGE_LIST) }
        report("tab switch, Project then Changelist", switches)
        say("tab switch, Project then Changelist, TaskScan.read runs per switch: ${switches.map { it.scans }}")
    }
}
