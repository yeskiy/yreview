package com.yeskiy.yreview.tasks

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.VcsDirectoryMapping
import com.intellij.openapi.vcs.changes.ChangeListManagerImpl
import com.intellij.openapi.vcs.impl.ProjectLevelVcsManagerImpl
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.HeavyPlatformTestCase
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.yeskiy.yreview.bench.BenchFixture
import com.yeskiy.yreview.bench.BenchSize
import com.yeskiy.yreview.bench.mapInto
import com.yeskiy.yreview.bench.must
import com.yeskiy.yreview.bench.vfs
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.ProcessGitRunner
import com.yeskiy.yreview.store.ReviewService
import git4idea.GitVcs
import git4idea.repo.GitRepositoryManager
import kotlinx.coroutines.runBlocking
import java.io.File
import java.nio.file.Files

/** The warmup at project open fills the shared scan result. JUnit 3 finds a test by the prefix test. */
class ScanWarmupTest : HeavyPlatformTestCase() {

    private lateinit var base: File

    override fun runInDispatchThread(): Boolean = false

    override fun setUp() {
        super.setUp()
        base = Files.createTempDirectory("y-review-warmup").toFile()
        // The TODO index reads the jars of the sandbox, and a heavy test allows only the listed roots.
        VfsRootAccess.allowRootAccess(testRootDisposable, System.getProperty("user.dir"))
        (ProjectLevelVcsManager.getInstance(project) as ProjectLevelVcsManagerImpl).waitForInitialized()
        ReviewSettings.getInstance(project).channel = false
        NoteScan.forget()
        DiffCache.forget()
        TaskScanService.getInstance(project).invalidate()
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

    private fun mapFixture() {
        val fixture = BenchFixture(base, BenchSize(
            modules = 2, packages = 2, filesPerPackage = 5, todoEvery = 3, rounds = 3,
            commentsPerRound = 12, changedPerRound = 4, dirtyFiles = 3, folderComments = 5, outsideFiles = 3, outsideComments = 4,
        )).also { it.build() }
        ReviewService.getInstance(project).homeOverride = fixture.home.path
        fixture.mapInto(project, module)
    }

    fun testTheFirstReadAfterTheWarmupStartsNoScan() {
        mapFixture()
        runBlocking { ScanWarmup().execute(project) }
        val before = TaskScan.reads.get()
        val found = TaskScanService.getInstance(project).read(false) {}
        assertEquals(before, TaskScan.reads.get())
        assertTrue(found.flatMap { it.tasks }.any { it.kind == TaskKind.COMMENT })
    }

    fun testAProjectWithNoReviewDataStartsNoScan() {
        val repo = File(base, "plain").apply { mkdirs() }
        ProcessGitRunner(repo, checkCanceled = {}).apply {
            must("init", "-q", "-b", "main")
            must("config", "user.email", "warmup@example.com")
            must("config", "user.name", "Warmup")
            File(repo, "a.txt").writeText("one\n")
            must("add", "-A")
            must("commit", "-q", "-m", "initial")
        }
        val root = vfs(repo)
        runInEdtAndWait { PsiTestUtil.addContentRoot(module, root) }
        ProjectLevelVcsManager.getInstance(project).directoryMappings = listOf(VcsDirectoryMapping(repo.path.replace('\\', '/'), GitVcs.NAME))
        checkNotNull(GitRepositoryManager.getInstance(project).getRepositoryForRoot(root)) { "git4idea found no repository" }
        val before = TaskScan.reads.get()
        runBlocking { ScanWarmup().execute(project) }
        assertEquals(before, TaskScan.reads.get())
    }
}
