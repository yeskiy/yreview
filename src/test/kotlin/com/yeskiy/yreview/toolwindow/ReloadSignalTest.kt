package com.yeskiy.yreview.toolwindow

import com.intellij.dvcs.repo.VcsRepositoryManager
import com.intellij.dvcs.repo.VcsRepositoryMappingListener
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.VcsDirectoryMapping
import com.intellij.openapi.vcs.VcsMappingListener
import com.intellij.openapi.vcs.changes.ChangeListManagerImpl
import com.intellij.openapi.vcs.impl.ProjectLevelVcsManagerImpl
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiTreeChangeAdapter
import com.intellij.psi.PsiTreeChangeEvent
import com.intellij.testFramework.HeavyPlatformTestCase
import com.intellij.testFramework.IndexingTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.ui.update.MergingUpdateQueue
import com.yeskiy.yreview.bench.BenchFixture
import com.yeskiy.yreview.bench.BenchSize
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.tasks.ScanPhase
import com.yeskiy.yreview.tasks.ScanState
import com.yeskiy.yreview.tasks.TaskScope
import git4idea.GitVcs
import git4idea.repo.GitRepositoryManager
import java.io.File
import java.nio.file.Files
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger

/**
 * The Project tab reads its scope again only for a change of a real file or folder of a store.
 * The comment card of the preview edits an in-memory file, and that edit must not start a read.
 */
class ReloadSignalTest : HeavyPlatformTestCase() {

    private lateinit var base: File

    private lateinit var fixture: BenchFixture

    override fun runInDispatchThread(): Boolean = false

    override fun setUp() {
        super.setUp()
        base = Files.createTempDirectory("y-review-reload").toFile()
        VfsRootAccess.allowRootAccess(testRootDisposable, System.getProperty("user.dir"))
        (ProjectLevelVcsManager.getInstance(project) as ProjectLevelVcsManagerImpl).waitForInitialized()
        buildProject()
    }

    override fun tearDown() {
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

    private fun vfs(file: File): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!

    private fun buildProject() {
        fixture = BenchFixture(base, SMALL).also { it.build() }
        ReviewSettings.getInstance(project).channel = false
        ReviewService.getInstance(project).homeOverride = fixture.home.path
        val work = vfs(fixture.work)
        VfsUtil.markDirtyAndRefresh(false, true, true, work, vfs(fixture.outside))
        runInEdtAndWait { PsiTestUtil.addContentRoot(module, work) }
        ProjectLevelVcsManager.getInstance(project).directoryMappings =
            listOf(VcsDirectoryMapping(fixture.repo.path.replace('\\', '/'), GitVcs.NAME))
        assertNotNull(GitRepositoryManager.getInstance(project).getRepositoryForRoot(vfs(fixture.repo)))
        // The new mapping also starts a background update that sends a repository mapping signal.
        // A tab that opens before that signal reads its scope twice, so the setup waits for it.
        VcsRepositoryManager.getInstance(project).waitForAsyncTaskCompletion()
        IndexingTestUtil.waitUntilIndexesAreReady(project)
        runInEdtAndWait { PlatformTestUtil.dispatchAllEventsInIdeEventQueue() }
    }

    private fun showPreview(on: Boolean) =
        TaskScope.entries.forEach { ReviewSettings.getInstance(project).tab(it).showPreview = on }

    private fun stateOf(panel: ReviewTreePanel): ScanState =
        panel.javaClass.getDeclaredField("state").apply { isAccessible = true }.get(panel) as ScanState

    private fun ticketOf(panel: ReviewTreePanel): Long =
        ScanState::class.java.getDeclaredField("ticket").apply { isAccessible = true }.getLong(stateOf(panel))

    private fun ready(panel: ReviewTreePanel): Boolean = stateOf(panel).phase == ScanPhase.READY

    /** Waits until [test] holds, and fails after [millis]. */
    private fun waitFor(millis: Long, test: () -> Boolean) {
        val end = System.currentTimeMillis() + millis
        while (!test()) {
            check(System.currentTimeMillis() < end) { "the test waited too long" }
            Thread.sleep(20)
        }
    }

    /** Opens the Project tab as the platform does when the tab shows, and waits for the first rows. */
    private fun open(): ReviewTreePanel {
        val panel = runInEdtAndGet { ReviewTreePanel(project, TaskScope.PROJECT) }
        Disposer.register(testRootDisposable, panel)
        runInEdtAndWait {
            (panel.javaClass.getDeclaredField("queue").apply { isAccessible = true }.get(panel) as MergingUpdateQueue).showNotify()
        }
        waitFor(60_000) { ready(panel) && stateOf(panel).rows > 0 }
        return panel
    }

    /** The count of reads that [change] starts, after the tab stays idle for [quietMillis]. */
    private fun readsFor(panel: ReviewTreePanel, quietMillis: Long = IDLE, change: () -> Unit): Long {
        val before = ticketOf(panel)
        change()
        Thread.sleep(quietMillis)
        waitFor(30_000) { ready(panel) }
        return ticketOf(panel) - before
    }

    private fun edit(file: VirtualFile) = runInEdtAndWait {
        val psi = PsiManager.getInstance(project).findFile(file)!!
        WriteCommandAction.runWriteCommandAction(project) {
            val document = FileDocumentManager.getInstance().getDocument(file)!!
            document.insertString(0, "edited line\n")
            PsiDocumentManager.getInstance(project).commitDocument(document)
        }
        assertTrue(psi.isValid)
    }

    // --- The tests ---

    fun `test the preview card makes one read per open and none while the tab is idle`() {
        showPreview(true)
        val light = AtomicInteger()
        val signals = ConcurrentLinkedQueue<String>()
        PsiManager.getInstance(project).addPsiTreeChangeListener(
            object : PsiTreeChangeAdapter() {
                override fun childrenChanged(event: PsiTreeChangeEvent) {
                    when (event.file?.virtualFile?.isInLocalFileSystem) {
                        false -> light.incrementAndGet()
                        true -> signals.add("psi ${event.file?.name}")
                        null -> Unit
                    }
                }
            },
            testRootDisposable,
        )
        project.messageBus.connect(testRootDisposable).apply {
            subscribe(VcsRepositoryManager.VCS_REPOSITORY_MAPPING_UPDATED, VcsRepositoryMappingListener { signals.add("repository mapping") })
            subscribe(ProjectLevelVcsManager.VCS_CONFIGURATION_CHANGED, VcsMappingListener { signals.add("vcs configuration") })
            subscribe(DumbService.DUMB_MODE, object : DumbService.DumbModeListener {
                override fun exitDumbMode() {
                    signals.add("index ready")
                }
            })
        }
        val panel = open()
        Thread.sleep(IDLE)
        waitFor(30_000) { ready(panel) }
        assertTrue("the preview card changed no in-memory file, so the test proves nothing", light.get() > 0)
        assertEquals("reads per open, after the signals $signals", 1L, ticketOf(panel))
        assertEquals("reads while idle", 0L, readsFor(panel) {})
    }

    fun `test a change of a project file reads the scope again`() {
        showPreview(false)
        val panel = open()
        val file = vfs(File(fixture.repo, fixture.sourceFiles.first()))
        assertTrue("reads after an edit", readsFor(panel) { edit(file) } >= 1)
    }

    fun `test a folder that appears or goes away reads the scope again`() {
        showPreview(false)
        val panel = open()
        val repo = vfs(fixture.repo)
        assertTrue("reads after a folder add", readsFor(panel) { runInEdtAndWait { WriteAction.run<Exception> { repo.createChildDirectory(this, "added") } } } >= 1)
        assertTrue("reads after a folder delete", readsFor(panel) { runInEdtAndWait { WriteAction.run<Exception> { repo.findChild("added")!!.delete(this) } } } >= 1)
    }

    fun `test a change of an open file outside the project reads the scope again`() {
        showPreview(false)
        val outside = vfs(File(fixture.outside, "O0.txt"))
        runInEdtAndWait { FileEditorManager.getInstance(project).openFile(outside, false) }
        val panel = open()
        assertTrue("reads after an edit of an open outside file", readsFor(panel) { edit(outside) } >= 1)
    }

    companion object {

        private const val IDLE = 3_000L

        private val SMALL = BenchSize(
            modules = 1,
            packages = 1,
            filesPerPackage = 5,
            todoEvery = 2,
            rounds = 1,
            commentsPerRound = 4,
            changedPerRound = 0,
            dirtyFiles = 0,
            folderComments = 2,
            outsideFiles = 2,
            outsideComments = 2,
        )
    }
}
