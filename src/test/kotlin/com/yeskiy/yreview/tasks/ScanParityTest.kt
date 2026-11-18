package com.yeskiy.yreview.tasks

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.changes.ChangeListManagerImpl
import com.intellij.openapi.vcs.impl.ProjectLevelVcsManagerImpl
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.HeavyPlatformTestCase
import com.intellij.testFramework.runInEdtAndWait
import com.yeskiy.yreview.bench.BenchFixture
import com.yeskiy.yreview.bench.BenchSize
import com.yeskiy.yreview.bench.mapInto
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.ProcessGitRunner
import com.yeskiy.yreview.store.ReviewService
import java.io.File
import java.nio.file.Files

/** The scan gives the same entries, rows and counts as the 1.2.0 scan. JUnit 3 finds a test by the prefix test. */
class ScanParityTest : HeavyPlatformTestCase() {

    private lateinit var base: File

    private lateinit var fixture: BenchFixture

    internal lateinit var fixtureRoot: VirtualFile

    override fun runInDispatchThread(): Boolean = false

    override fun setUp() {
        super.setUp()
        base = Files.createTempDirectory("y-review-parity").toFile()
        // The TODO index reads the jars of the sandbox, and a heavy test allows only the listed roots.
        VfsRootAccess.allowRootAccess(testRootDisposable, System.getProperty("user.dir"))
        (ProjectLevelVcsManager.getInstance(project) as ProjectLevelVcsManagerImpl).waitForInitialized()
        fixture = BenchFixture(base, small()).also { it.build() }
        ReviewSettings.getInstance(project).channel = false
        ReviewService.getInstance(project).homeOverride = fixture.home.path
        fixtureRoot = fixture.mapInto(project, module)
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

    private fun small() = BenchSize(
        modules = 2, packages = 2, filesPerPackage = 5, todoEvery = 3, rounds = 3,
        commentsPerRound = 12, changedPerRound = 4, dirtyFiles = 3, folderComments = 5, outsideFiles = 3, outsideComments = 4,
    )

    internal fun cold() {
        NoteScan.forget()
        DiffCache.forget()
    }

    /** The commits of the fixture repository, then of the outside repository, oldest first. */
    internal fun commits(): List<String> = listOf(fixture.repo, fixture.outside).flatMap { dir ->
        ProcessGitRunner(dir, checkCanceled = {}).run("rev-list", "--reverse", "HEAD").stdout.lines().filter { it.isNotBlank() }
    }

    private fun names(): Map<String, String> = listOf(base.canonicalPath, base.path).flatMap { listOf(it, it.replace('\\', '/')) }
        .distinct().flatMap { listOf("$it${File.separator}" to "BASE/", it to "BASE") }
        .plus(module.name to "MODULE").toMap(LinkedHashMap())

    internal fun dump(): String = commits().let { commits ->
        ScanDump.of(TaskScan.read(project, null, showResolved = true), commits, names()) +
            "\n---\n" + ScanDump.of(TaskScan.read(project, null), commits, names())
    }

    fun testTheScanMatchesTheGolden() {
        cold()
        val golden = javaClass.getResource("scan-parity-golden.txt")!!.readText().replace("\r\n", "\n")
        assertEquals(golden, dump() + "\n")
    }

    fun testAWarmScanEqualsAColdScan() {
        cold()
        assertEquals(dump(), dump())
    }
}
