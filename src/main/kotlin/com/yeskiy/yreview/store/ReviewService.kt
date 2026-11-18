package com.yeskiy.yreview.store

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.dvcs.repo.VcsRepositoryManager
import com.intellij.dvcs.repo.VcsRepositoryMappingListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent
import com.intellij.openapi.vfs.newvfs.events.VFileDeleteEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.handoff.GitDir
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.settings.ShareLog
import com.yeskiy.yreview.ui.ReviewNotice
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryChangeListener
import git4idea.repo.GitRepositoryManager
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap

/** The comment that was written, and the reason the push failed when it did. */
data class CommentWriteResult(val stored: StoredComment, val shareError: String?)

/** How many note lines a delete removed, and the reason the push failed when it did. */
data class CommentDeleteResult(val removed: Int, val shareError: String?)

@Service(Service.Level.PROJECT)
class ReviewService(private val project: Project) : Disposable {

    private val migrating = ConcurrentHashMap.newKeySet<String>()

    private val facts = StoreFacts(::probe)

    private val realHome by lazy { StoreRules.homeOf(System.getProperty("user.home")) }

    /** A test sets this to use a fake home folder. */
    internal var homeOverride: String? = null

    init {
        val bus = project.messageBus.connect(this)
        bus.subscribe(GitRepository.GIT_REPO_CHANGE, GitRepositoryChangeListener { facts.forget() })
        bus.subscribe(VcsRepositoryManager.VCS_REPOSITORY_MAPPING_UPDATED, VcsRepositoryMappingListener { facts.forget() })
        bus.subscribe(
            VirtualFileManager.VFS_CHANGES,
            object : BulkFileListener {
                override fun after(events: List<VFileEvent>) {
                    if (events.any(::changesAStore)) facts.forget()
                }
            },
        )
    }

    override fun dispose() = Unit

    fun bookForRoot(root: VirtualFile): CommentBook = bookFor(storeAt(root))

    fun bookFor(file: VirtualFile): CommentBook? = repositoryRoot(file)?.let { bookForRoot(it) }

    fun headOf(file: VirtualFile): String? =
        GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)?.currentRevision

    fun relativePath(file: VirtualFile): String? {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)
            ?: return (anchorOf(file) as? AnchorResult.Found)?.anchor?.path
        return AnchorRules.relative(file.path, repository.root.path)
    }

    fun repositoryRoot(file: VirtualFile): VirtualFile? =
        GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)?.root
            ?: (anchorOf(file) as? AnchorResult.Found)?.anchor?.root

    /** The rule of the project, applied to one file. It can start git, so it never runs on the EDT. */
    fun anchorOf(file: VirtualFile): AnchorResult =
        resolve(file) { StoreFacts.Cached(facts.repositoryOf(it)) } ?: AnchorResult.NoPlace

    /** The same answer from the cache. It starts no process, and it is null on a cache miss. */
    fun anchorOfCached(file: VirtualFile): AnchorResult? = resolve(file, facts::cached)

    /** The cached answer, else [anchorOf] under a progress dialog when the caller is on the EDT. */
    fun anchorWithProgress(file: VirtualFile): AnchorResult {
        anchorOfCached(file)?.let { return it }
        val task = ThrowableComputable<AnchorResult, RuntimeException> { anchorOf(file) }
        if (!ApplicationManager.getApplication().isDispatchThread) return task.compute()
        return ProgressManager.getInstance()
            .runProcessWithProgressSynchronously(task, "Finding the Review Store", true, project)
    }

    fun home(): String? = homeOverride ?: realHome

    /** True for a git root that the project knows, the project folder and each content root. */
    fun isProjectRoot(root: String): Boolean =
        root in candidateFolderRoots().map { it.path } ||
            GitRepositoryManager.getInstance(project).repositories.any { it.root.path == root }

    /** Null only when [lookup] has no answer for the folder of the file. */
    private fun resolve(file: VirtualFile, lookup: (String) -> StoreFacts.Cached?): AnchorResult? {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)
        val fact = when {
            repository != null -> RepositoryFact(repository.root.path, repository.currentRevision)
            !file.isInLocalFileSystem -> return AnchorResult.NoPlace
            else -> (lookup(file.parent?.path ?: return AnchorResult.NoPlace) ?: return null).fact
        }
        val plan = AnchorRules.plan(
            file.path,
            fact?.root,
            fact?.head,
            { AnchorRules.folderRoot(file.path, projectDirPath(), contentRootPaths()) },
            home(),
            { Files.isDirectory(Path.of(StoreRules.storeFolder(it))) },
        )
        val local = LocalFileSystem.getInstance()
        return when (plan) {
            is AnchorPlan.Git -> (repository?.root ?: local.findFileByPath(plan.root))
                ?.let { AnchorResult.Found(ReviewAnchor(StoreKind.GIT, it, plan.commit, plan.path)) }
            is AnchorPlan.Folder -> local.findFileByPath(plan.root)
                ?.let { AnchorResult.Found(ReviewAnchor(StoreKind.FOLDER, it, FolderStore.WORKTREE, plan.path)) }
            AnchorPlan.NoCommit -> AnchorResult.NoCommit
            AnchorPlan.HomeFile -> AnchorResult.HomeFile
            AnchorPlan.NoPlace -> AnchorResult.NoPlace
        } ?: AnchorResult.NoPlace
    }

    /**
     * Asks git for the repository of a folder that the manager does not know. The root comes
     * from the parents of the folder, so it keeps the path form of the file system of the IDE.
     */
    private fun probe(dir: String): RepositoryFact? {
        val folder = LocalFileSystem.getInstance().findFileByPath(dir) ?: return null
        val git = ideGitRunner(project, folder)
        val up = git.run("rev-parse", "--show-cdup").takeIf { it.ok } ?: return null
        val levels = up.stdout.trim().split('/').count { it == ".." }
        val root = generateSequence(folder) { it.parent }.elementAtOrNull(levels) ?: return null
        val head = git.run("rev-parse", "-q", "--verify", "HEAD^{commit}").takeIf { it.ok }?.stdout?.trim()
        return RepositoryFact(root.path, head?.ifEmpty { null })
    }

    private fun changesAStore(event: VFileEvent): Boolean = when (event) {
        is VFileCreateEvent -> event.childName in STORE_NAMES
        is VFileDeleteEvent -> event.file.name in STORE_NAMES
        else -> false
    }

    fun bookFor(anchor: ReviewAnchor): CommentBook = bookFor(StoreRoot(anchor.kind, anchor.root))

    /**
     * The book of one store.
     *
     * A folder root is not a repository, and `git config user.email` still answers there, so
     * both kinds name the author the same way.
     */
    fun bookFor(store: StoreRoot): CommentBook {
        val runner = ideGitRunner(project, store.root)
        return CommentBook(
            if (store.kind == StoreKind.GIT) NotesGateway(runner) else folderNotesOf(store.root),
            authorOf = { GitAuthor.of(runner) },
        )
    }

    /**
     * The store that owns this root.
     *
     * Every caller that holds a root and not an anchor asks this. The answer keeps the old
     * signatures of [resolveComment] and [deleteComments], so no caller of those two changes.
     */
    fun storeAt(root: VirtualFile): StoreRoot =
        if (GitRepositoryManager.getInstance(project).getRepositoryForRootQuick(root) != null ||
            facts.cached(root.path)?.fact?.root == root.path
        ) {
            StoreRoot(StoreKind.GIT, root)
        } else {
            StoreRoot(StoreKind.FOLDER, root)
        }

    fun folderNotesOf(root: VirtualFile): FolderNotes = FolderNotes(Path.of(root.path))

    /**
     * Every git root, and then every folder that already holds a store.
     *
     * A caller that answers a read of an agent passes false for [migrate]. See
     * [migrateFolderIfNeeded] for what the migration writes.
     */
    fun storeRoots(migrate: Boolean = true): List<StoreRoot> =
        GitRepositoryManager.getInstance(project).repositories.map { StoreRoot(StoreKind.GIT, it.root) } +
            folderStoreRoots(migrate).map { StoreRoot(StoreKind.FOLDER, it) }

    /**
     * Every folder root that still holds records.
     *
     * The migration runs first, over every candidate root, and it runs before the filter that
     * drops a root which a repository now covers. A root that the filter dropped first would
     * never migrate, and its records would stay in the folder for good.
     */
    fun folderStoreRoots(migrate: Boolean = true): List<VirtualFile> {
        val roots = candidateFolderRoots()
        roots.forEach { migrateFolderIfNeeded(it, migrate) }
        return roots
            .filter { storeAt(it).kind == StoreKind.FOLDER }
            .filter { root -> NoteRefs.ALL.any { folderNotesOf(root).commitsWithNotes(it).isNotEmpty() } }
    }

    /**
     * Moves a folder store into the git notes after a repository covers its root.
     *
     * The check runs on every read, so a repository that appeared while the project was
     * closed still reaches this path. The guard keeps two reads from moving the same folder
     * at once, and the copy itself repeats without harm.
     *
     * The copy and the check run first. The move runs last. A crash between them leaves both
     * copies, and the next read repeats the copy without a duplicate.
     *
     * [FolderOwnership] answers whether the folder belongs to the plugin at all. A folder
     * that git tracks came with the repository, so it stays where it is.
     *
     * [FolderMigration.mayMove] answers whether this lookup may move the records at all, and
     * whether this repository is the right target. A repository that is rooted above the
     * folder reads every record path from its own root, so the records stay in the folder
     * and the tool window reads them there.
     *
     * A caller that answers a read of an agent passes false for [writes], because this
     * method writes the git notes and moves a folder.
     */
    fun migrateFolderIfNeeded(root: VirtualFile, writes: Boolean = true) {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(root) ?: return
        if (!FolderMigration.mayMove(writes, repository.root.path, root.path)) return
        val head = repository.currentRevision ?: return
        val folder = folderNotesOf(root)
        if (NoteRefs.ALL.none { folder.commitsWithNotes(it).isNotEmpty() }) return
        if (!FolderOwnership.mayMigrate(ideGitRunner(project, root))) return
        if (!migrating.add(root.path)) return
        try {
            val runner = ideGitRunner(project, repository.root)
            val report = FolderMigration.copy(folder, NotesGateway(runner), NoteRefs.ALL, head)
            val notice = FolderMigration.notice(
                report,
                Path.of(root.path),
                repository.root.name,
                movedTo(runner, report, root),
            )
            if (notice.warning) ReviewNotice.warn(project, notice.text) else ReviewNotice.say(project, notice.text)
            if (notice.refresh) notifyChanged()
        } finally {
            migrating.remove(root.path)
        }
    }

    /** The new place of the old folder, and null while the folder stays where it is. */
    private fun movedTo(runner: GitRunner, report: MigrationReport, root: VirtualFile): Path? {
        if (report.problem != null) return null
        return GitDir.reviewFolder(runner)
            ?.resolve("migrated-${System.currentTimeMillis()}")
            ?.takeIf { moveFolder(root, it) }
    }

    /** The old folder goes into the git directory, which git never tracks, so it needs no ignore entry. */
    private fun moveFolder(root: VirtualFile, target: Path): Boolean = runCatching {
        Files.createDirectories(target.parent)
        Files.move(Path.of(root.path).resolve(FolderStore.FOLDER), target)
        true
    }.getOrDefault(false)

    private fun candidateFolderRoots(): List<VirtualFile> {
        val local = LocalFileSystem.getInstance()
        return (listOfNotNull(projectDirPath()) + contentRootPaths())
            .distinct()
            .mapNotNull { local.findFileByPath(it) }
    }

    /**
     * The folder the project opens.
     *
     * The documentation of `basePath` warns against its use, because that path is not always
     * the parent of the .idea folder. `guessProjectDir` is the call that JetBrains names.
     */
    private fun projectDirPath(): String? =
        runCatching { project.guessProjectDir()?.path }.getOrNull()

    /**
     * A content root read needs a read lock, so the call runs inside one.
     *
     * A thread that already holds the lock runs the block as it is, so the same call works
     * from a pooled thread and from inside the read action of an intention.
     */
    private fun contentRootPaths(): List<String> =
        ReadAction.nonBlocking<List<String>> {
            ProjectRootManager.getInstance(project).contentRoots.map { it.path }
        }.executeSynchronously()

    fun addComment(
        root: VirtualFile,
        ref: String,
        commit: String,
        path: String,
        range: Range,
        text: String,
    ): CommentWriteResult = finish(root, bookForRoot(root).add(ref, commit, path, range, text))

    /** A folder store has no remote, so it takes no share step and it starts no bridge. */
    fun addComment(
        anchor: ReviewAnchor,
        ref: String,
        range: Range,
        text: String,
        lineText: String? = LineText.onDisk(anchor.root.path, anchor.path, range),
    ): CommentWriteResult {
        val stored = bookFor(anchor).add(ref, anchor.key, anchor.path, range, text, lineText)
        if (anchor.kind == StoreKind.FOLDER) {
            notifyChanged()
            return CommentWriteResult(stored, null)
        }
        return finish(anchor.root, stored)
    }

    fun resolveComment(root: VirtualFile, stored: StoredComment): CommentWriteResult {
        val store = storeAt(root)
        val update = bookFor(store).resolve(stored)
        if (store.kind == StoreKind.FOLDER) {
            notifyChanged()
            return CommentWriteResult(update, null)
        }
        return finish(root, update)
    }

    /**
     * Removes these comments from the git notes and pushes every shared ref they touched.
     *
     * A delete is final, because the plugin keeps no copy of the removed line. A failed
     * push leaves the note where it is, and the next successful push carries the change.
     */
    fun deleteComments(root: VirtualFile, records: List<StoredComment>): CommentDeleteResult {
        val store = storeAt(root)
        val removed = bookFor(store).remove(records)
        if (removed == 0) return CommentDeleteResult(0, null)
        if (store.kind == StoreKind.FOLDER) {
            notifyChanged()
            return CommentDeleteResult(removed, null)
        }
        val errors = records.map { it.ref }.distinct()
            .filter { NoteRefs.isShared(it) }
            .mapNotNull { pushRef(root, it) }
        BridgeService.getInstance(project).startLater()
        notifyChanged()
        return CommentDeleteResult(removed, errors.joinToString(" ").ifEmpty { null })
    }

    /**
     * Pushes one shared ref, and drops the marks that this push carried.
     *
     * One push carries every note of one ref of one root, so a comment that waited for
     * such a push is shared the moment it works. Null after a good push, and the reason
     * after a bad one.
     */
    private fun pushRef(root: VirtualFile, ref: String): String? {
        val result = runShare(root, ref)
        if (!result.ok) return result.message
        ShareLog.getInstance(project).clear(root.path, ref)
        if (result.needsRefspec) RefspecPrompt.getInstance(project).offer(root.path, root.name) { sharing(root).addFetchRefspec() }
        return null
    }

    private fun sharing(root: VirtualFile): NotesSharing =
        ReviewSettings.getInstance(project).let { NotesSharing(ideGitRunner(project, root), it.remote, it.writeRefspec) }

    private fun finish(root: VirtualFile, stored: StoredComment): CommentWriteResult {
        val error = share(root, stored)
        BridgeService.getInstance(project).startLater()
        notifyChanged()
        return CommentWriteResult(stored, error)
    }

    /**
     * A note of a shared ref goes to the remote at once. A failure leaves the note where it is
     * and marks the comment, so the tool window states that the comment is not shared.
     */
    private fun share(root: VirtualFile, stored: StoredComment): String? {
        if (!NoteRefs.isShared(stored.ref)) return null
        val problem = pushRef(root, stored.ref) ?: return null
        ShareLog.getInstance(project).markUnshared(stored.id, root.path, stored.ref)
        return problem
    }

    private fun runShare(root: VirtualFile, ref: String): ShareResult {
        val task = ThrowableComputable<ShareResult, RuntimeException> { sharing(root).share(ref) }
        if (!ApplicationManager.getApplication().isDispatchThread) return task.compute()
        return ProgressManager.getInstance()
            .runProcessWithProgressSynchronously(task, "Sharing the Review Comment", true, project)
    }

    private fun notifyChanged() {
        ApplicationManager.getApplication().invokeLater({
            project.messageBus.syncPublisher(REVIEW_COMMENTS).commentsChanged()
            DaemonCodeAnalyzer.getInstance(project).restart("a review comment changed")
        }, project.disposed)
    }

    companion object {
        private val STORE_NAMES = setOf(".git", FolderStore.FOLDER)

        fun getInstance(project: Project): ReviewService = project.service()
    }
}
