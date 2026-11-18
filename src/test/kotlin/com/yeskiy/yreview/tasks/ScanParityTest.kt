package com.yeskiy.yreview.tasks

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.changes.ChangeListManagerImpl
import com.intellij.openapi.vcs.impl.ProjectLevelVcsManagerImpl
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.HeavyPlatformTestCase
import com.intellij.testFramework.IndexingTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.yeskiy.yreview.bench.BenchFixture
import com.yeskiy.yreview.bench.BenchSize
import com.yeskiy.yreview.bench.mapInto
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.ProcessGitRunner
import com.yeskiy.yreview.store.ReviewService
import git4idea.repo.GitRepositoryManager
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

    fun testAnOutsideNoteWriteShowsAtTheNextScan() {
        cold()
        TaskScan.read(project, null)
        writeOutsideNote()
        val warm = dump()
        cold()
        assertEquals(dump(), warm)
        assertTrue(warm.contains("outside note"))
    }

    private fun dumpOf(found: List<RepositoryTasks>): String = ScanDump.of(found, commits(), names())

    /** A first scan fills the store cache of the outside root, so the next stamp is sure. */
    private fun service(): TaskScanService {
        TaskScan.read(project, null)
        return TaskScanService.getInstance(project).also { it.invalidate() }
    }

    /** A file keeps the quotes of the record, which a Windows command line can lose. */
    private fun writeOutsideNote() {
        val note = File(base, "outside-note.txt").apply { writeText(fixture.outsideNote(fixture.sourceFiles[3]) + "\n") }
        val write = ProcessGitRunner(fixture.repo, checkCanceled = {})
            .run("notes", "--ref", NoteRefs.LOCAL, "append", "-F", note.absolutePath, fixture.heads.last())
        check(write.ok) { write.stderr }
    }

    fun testTwoReadsWithNoChangeShareOneScan() {
        cold()
        val service = service()
        val before = TaskScan.reads.get()
        val first = service.read(false) {}
        val second = service.read(false) {}
        assertSame(first, second)
        assertEquals(before + 1, TaskScan.reads.get())
    }

    fun testAnInvalidateGivesANewScan() {
        cold()
        val service = service()
        val before = TaskScan.reads.get()
        val first = service.read(false) {}
        service.invalidate()
        val second = service.read(false) {}
        assertNotSame(first, second)
        assertEquals(before + 2, TaskScan.reads.get())
        assertEquals(dumpOf(first), dumpOf(second))
    }

    fun testAnOutsideNoteWriteGivesANewScanWithTheNewComment() {
        cold()
        val service = service()
        val first = service.read(false) {}
        writeOutsideNote()
        val second = service.read(false) {}
        assertNotSame(first, second)
        cold()
        assertEquals(dumpOf(TaskScan.read(project, null)), dumpOf(second))
        assertTrue(dumpOf(second).contains("outside note"))
        assertFalse(dumpOf(first).contains("outside note"))
    }

    fun testABranchSwitchGivesTheRowsOfTheNewBranch() {
        cold()
        val service = service()
        val first = service.read(false) {}
        val git = ProcessGitRunner(fixture.repo, checkCanceled = {})
        val checkout = git.run("checkout", "-q", "-f", "-b", "other", "HEAD~1")
        check(checkout.ok) { checkout.stderr }
        GitRepositoryManager.getInstance(project).getRepositoryForRoot(fixtureRoot)!!.update()
        VfsUtil.markDirtyAndRefresh(false, true, true, fixtureRoot)
        IndexingTestUtil.waitUntilIndexesAreReady(project)
        val second = service.read(false) {}
        assertNotSame(first, second)
        assertFalse(dumpOf(first) == dumpOf(second))
        cold()
        assertEquals(dumpOf(TaskScan.read(project, null)), dumpOf(second))
    }

    fun testTwoTabsAtTheSameMomentRunOneScan() {
        cold()
        val service = service()
        val before = TaskScan.reads.get()
        val reads = (1..2).map { ApplicationManager.getApplication().executeOnPooledThread<List<RepositoryTasks>> { service.read(false) {} } }
            .map { it.get() }
        assertSame(reads[0], reads[1])
        assertEquals(before + 1, TaskScan.reads.get())
    }

    fun testAnInvalidateDuringAScanGivesTheWaitingTabTheNewScan() {
        cold()
        val service = service()
        TaskScan.partDelay = 400
        try {
            val waiting = ApplicationManager.getApplication().executeOnPooledThread<List<RepositoryTasks>> { service.read(false) {} }
            Thread.sleep(100)
            service.invalidate()
            val newer = service.read(false) {}
            assertSame(newer, waiting.get())
        } finally {
            TaskScan.partDelay = 0
        }
    }

    fun testTheResolvedSwitchHasItsOwnResult() {
        cold()
        val service = service()
        val open = service.read(false) {}
        val all = service.read(true) {}
        assertNotSame(open, all)
        assertEquals(dumpOf(TaskScan.read(project, null, false)), dumpOf(open))
        assertEquals(dumpOf(TaskScan.read(project, null, true)), dumpOf(all))
    }

    fun testTheStampOfTheProjectChangesAfterABranchSwitch() {
        TaskScan.read(project, null)
        val before = ScanStamp.of(project)
        assertTrue(before.sure)
        assertTrue(before.matches(ScanStamp.of(project)))
        val checkout = ProcessGitRunner(fixture.repo, checkCanceled = {}).run("checkout", "-q", "-f", "-b", "other", "HEAD~1")
        check(checkout.ok) { checkout.stderr }
        GitRepositoryManager.getInstance(project).getRepositoryForRoot(fixtureRoot)!!.update()
        assertFalse(before.matches(ScanStamp.of(project)))
    }

    fun testTheStampOfTheProjectChangesAfterAnOutsideNoteWrite() {
        TaskScan.read(project, null)
        val before = ScanStamp.of(project)
        assertTrue(before.sure)
        writeOutsideNote()
        assertFalse(before.matches(ScanStamp.of(project)))
    }
}
