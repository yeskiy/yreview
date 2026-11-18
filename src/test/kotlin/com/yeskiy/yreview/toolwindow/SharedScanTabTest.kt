package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.tasks.ScanPhase
import com.yeskiy.yreview.tasks.TaskScan
import com.yeskiy.yreview.tasks.TaskScope
import java.io.File
import java.nio.file.Files

/** A tab that shows after another tab reads the shared result. JUnit 3 finds a test by the prefix test. */
class SharedScanTabTest : BasePlatformTestCase() {

    private var channel = true

    private val folders = mutableListOf<File>()

    private val service: ReviewService get() = ReviewService.getInstance(project)

    // A panel starts the bridge, and the later tests of the shared project expect it down.
    override fun setUp() {
        super.setUp()
        channel = ReviewSettings.getInstance(project).channel
        ReviewSettings.getInstance(project).channel = false
        service.homeOverride = Files.createTempDirectory("y-review-shared").toFile().also { folders.add(it) }.path
    }

    override fun tearDown() {
        try {
            FileEditorManager.getInstance(project).openFiles.forEach { FileEditorManager.getInstance(project).closeFile(it) }
            service.homeOverride = null
            ReviewSettings.getInstance(project).channel = channel
            BridgeService.getInstance(project).stop()
            folders.forEach { it.deleteRecursively() }
        } finally {
            super.tearDown()
        }
    }

    /** Waits until the tab ends a scan with a ticket newer than [after]. */
    private fun waitReady(panel: ReviewTreePanel, after: Long = 0) =
        PlatformTestUtil.waitWithEventsDispatching(
            "the scan of the tab",
            { panel.state.ticket > after && panel.state.phase == ScanPhase.READY },
            30,
        )

    private fun shown(scope: TaskScope): ReviewTreePanel =
        ReviewTreePanel(project, scope).also { panel ->
            panel.queue.showNotify()
            waitReady(panel)
        }

    private fun <T> withTabs(vararg scopes: TaskScope, block: (List<ReviewTreePanel>) -> T): T {
        val panels = mutableListOf<ReviewTreePanel>()
        try {
            return block(scopes.map { shown(it).also(panels::add) })
        } finally {
            panels.forEach(Disposer::dispose)
        }
    }

    private fun vfs(file: File): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!

    fun testTheSecondTabStartsNoScan() {
        val first = shown(TaskScope.PROJECT)
        try {
            val before = TaskScan.reads.get()
            withTabs(TaskScope.CHANGE_LIST) { assertEquals(before, TaskScan.reads.get()) }
        } finally {
            Disposer.dispose(first)
        }
    }

    fun testARefreshScansAgain() = withTabs(TaskScope.PROJECT, TaskScope.CHANGE_LIST) { (panel, _) ->
        val before = TaskScan.reads.get()
        val ticket = panel.state.ticket
        val refresh = panel.toolbar.actions.single { it.templatePresentation.text == "Refresh" }
        refresh.actionPerformed(TestActionEvent.createTestEvent(refresh))
        waitReady(panel, ticket)
        assertEquals(before + 1, TaskScan.reads.get())
    }

    fun testACommentWriteScansAgainAndShowsTheComment() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            val file = vfs(File(repo.dir, "a.txt"))
            FileEditorManager.getInstance(project).openFile(file, false)
            val anchor = (service.anchorOf(file) as AnchorResult.Found).anchor
            withTabs(TaskScope.PROJECT) { (panel) ->
                val before = TaskScan.reads.get()
                val ticket = panel.state.ticket
                service.addComment(anchor, NoteRefs.LOCAL, Range(startLine = 1, endLine = 1), "shared scan comment")
                waitReady(panel, ticket)
                assertEquals(before + 1, TaskScan.reads.get())
                assertTrue(panel.repositories.flatMap { it.tasks }.any { it.text == "shared scan comment" })
            }
        }
    }
}
