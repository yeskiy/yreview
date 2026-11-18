package com.yeskiy.yreview.store

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.settings.ShareLog
import com.yeskiy.yreview.tasks.TaskScan
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList

/** A note store that takes each append and keeps nothing, which is what a failed note write looks like. */
private class SilentNotes : NoteStore {

    override fun readLines(ref: String, commit: String): List<String> = emptyList()

    override fun readOrRefuse(ref: String, commit: String): List<String> = emptyList()

    override fun append(ref: String, commit: String, line: String) = Unit

    override fun rewrite(ref: String, commit: String, lines: List<String>) = Unit

    override fun commitsWithNotes(ref: String): List<String> = emptyList()

    override fun commitsOrRefuse(ref: String): List<String> = emptyList()
}

/** Child folder stores move into the git notes with new paths. JUnit 3 finds a test by the prefix test. */
class ChildMigrationTest : BasePlatformTestCase() {

    private val folders = mutableListOf<File>()

    private val notices = CopyOnWriteArrayList<Notification>()

    private val calls = CopyOnWriteArrayList<List<String>>()

    private val service: ReviewService get() = ReviewService.getInstance(project)

    override fun setUp() {
        super.setUp()
        ShareLog.getInstance(project).loadState(ShareLog.State())
        service.homeOverride = vfs(Files.createTempDirectory("y-review-home").toFile().also { folders.add(it) }).path
        service.runnerOverride = { root ->
            val real = ideGitRunner(project, root)
            object : GitRunner {
                override fun run(vararg args: String): GitResult = real.run(*args).also { calls.add(args.toList()) }
            }
        }
        project.messageBus.connect(testRootDisposable).subscribe(
            Notifications.TOPIC,
            object : Notifications {
                override fun notify(notification: Notification) {
                    notices.add(notification)
                }
            },
        )
    }

    override fun tearDown() {
        try {
            service.homeOverride = null
            service.runnerOverride = null
            service.notesOverride = null
            folders.forEach { it.deleteRecursively() }
        } finally {
            super.tearDown()
        }
    }

    private fun vfs(file: File): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!

    private fun book(store: NoteStore) = CommentBook(store, author = "a@b.c", clock = { 1_700_000_000L })

    private fun settle(repo: TempRepo) {
        PlatformTestUtil.waitForFuture(service.settleRepository(vfs(repo.dir)), 60_000)
        PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
    }

    /** A comment on sub/f.txt and its resolve record in the folder store at sub. */
    private fun subStore(repo: TempRepo): Pair<FolderNotes, List<StoredComment>> {
        val sub = File(repo.dir, "sub").also { it.mkdirs() }
        File(sub, "f.txt").writeText("x\n")
        val folder = FolderNotes(sub.toPath())
        val comment = book(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "f.txt", Range(startLine = 1, endLine = 1), "one")
        return folder to listOf(comment, book(folder).resolve(comment))
    }

    private fun linesOf(store: NoteStore, key: String): List<String> = NoteRefs.ALL.flatMap { store.readLines(it, key) }

    private fun bytesOf(dir: File): Map<String, List<Byte>> =
        dir.walkTopDown().filter { it.isFile }.associate { it.relativeTo(dir).path to it.readBytes().toList() }

    private fun migratedFolders(repo: TempRepo): List<File> =
        File(repo.dir, ".git/y-review").listFiles().orEmpty().filter { it.name.startsWith("migrated-") }

    fun testAChildStoreMovesWithNewPathsAndIdentifiers() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "a\n")
            val (folder, records) = subStore(repo)
            val renames = FolderMigration.rewrite(linesOf(folder, FolderStore.WORKTREE), "sub").renames
            val old = bytesOf(File(repo.dir, "sub/.y-review"))

            settle(repo)

            val notes = book(NotesGateway(repo.git)).list(head)
            assertEquals(2, notes.size)
            assertTrue(notes.all { it.comment.location?.path == "sub/f.txt" })
            assertEquals(records.map { renames.getValue(it.id) }.toSet(), notes.map { it.id }.toSet())
            assertEquals(renames.getValue(records[0].id), notes.single { it.comment.resolved == true }.comment.original)
            assertTrue(book(NotesGateway(repo.git)).open(head).isEmpty())
            assertFalse(File(repo.dir, "sub/.y-review").exists())
            val moved = migratedFolders(repo).single()
            assertTrue(moved.name, Regex("migrated-\\d+-0").matches(moved.name))
            assertEquals(old, bytesOf(moved))
            assertEquals(renames.getValue(records[0].id), ShareLog.getInstance(project).forward(records[0].id))
        }
    }

    fun testASecondSettleWritesNothing() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "a\n")
            subStore(repo)
            settle(repo)
            val before = linesOf(NotesGateway(repo.git), head)

            settle(repo)

            assertEquals(before, linesOf(NotesGateway(repo.git), head))
            assertEquals(1, migratedFolders(repo).size)
        }
    }

    fun testARootStoreKeepsEachLineByteForByte() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "a\n")
            val folder = FolderNotes(repo.dir.toPath())
            val comment = book(folder).add(NoteRefs.LOCAL, FolderStore.WORKTREE, "a.txt", Range(startLine = 1, endLine = 1), "one")
            val lines = linesOf(folder, FolderStore.WORKTREE)

            settle(repo)

            assertEquals(lines, linesOf(NotesGateway(repo.git), head))
            assertEquals(comment.id, ShareLog.getInstance(project).forward(comment.id))
        }
    }

    fun testAFailedNoteWriteKeepsTheFolderAndWarns() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            val (_, records) = subStore(repo)
            service.notesOverride = { SilentNotes() }

            settle(repo)

            assertTrue(File(repo.dir, "sub/.y-review/notes").isDirectory)
            assertEquals(records[0].id, ShareLog.getInstance(project).forward(records[0].id))
            assertTrue(notices.any { it.type == NotificationType.WARNING })
            val file = vfs(File(repo.dir, "sub/f.txt"))
            assertEquals(ReviewAnchor(StoreKind.FOLDER, vfs(File(repo.dir, "sub")), FolderStore.WORKTREE, "f.txt"), service.leftoverOf(file))
            assertTrue(vfs(File(repo.dir, "sub")) in service.folderStoreRoots(migrate = false))
        }
    }

    fun testARepositoryWithNoCommitKeepsTheFolderStore() {
        TempRepo().use { repo ->
            subStore(repo)

            settle(repo)

            assertTrue(File(repo.dir, "sub/.y-review/notes").isDirectory)
            val file = vfs(File(repo.dir, "sub/f.txt"))
            assertEquals(
                AnchorResult.Found(ReviewAnchor(StoreKind.FOLDER, vfs(File(repo.dir, "sub")), FolderStore.WORKTREE, "f.txt")),
                service.anchorOf(file),
            )
        }
    }

    fun testATrackedStoreStaysWhereItIs() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "a\n")
            subStore(repo)
            check(repo.git.run("add", "sub").ok)
            check(repo.git.run("commit", "-q", "-m", "store").ok)

            settle(repo)

            assertTrue(File(repo.dir, "sub/.y-review/notes").isDirectory)
            assertTrue(linesOf(NotesGateway(repo.git), head).isEmpty())
        }
    }

    fun testAnOpenFileSettlesItsNearestStore() {
        TempRepo().use { repo ->
            val head = repo.commit("a.txt", "a\n")
            subStore(repo)

            PlatformTestUtil.waitForFuture(service.settleFile(vfs(File(repo.dir, "sub/f.txt"))), 60_000)

            assertFalse(File(repo.dir, "sub/.y-review").exists())
            assertEquals(2, book(NotesGateway(repo.git)).list(head).size)
            assertTrue(calls.none { "--others" in it })
        }
    }

    fun testTheSearchRunsTwoGitProcesses() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            subStore(repo)

            settle(repo)

            assertEquals(2, calls.count { it.firstOrNull() == "ls-files" && "--others" in it })
        }
    }

    fun testTheTaskScanNeverSearchesForChildStores() {
        TempRepo().use { repo ->
            repo.commit("a.txt", "a\n")
            subStore(repo)

            TaskScan.read(project, null)

            assertTrue(calls.none { "--others" in it })
            assertTrue(File(repo.dir, "sub/.y-review/notes").isDirectory)
        }
    }
}
