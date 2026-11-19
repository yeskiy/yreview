package com.yeskiy.yreview.tasks

import com.intellij.ide.todo.TodoConfiguration
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.search.PsiTodoSearchHelper
import com.intellij.psi.search.TodoItem
import com.intellij.util.Processor
import com.yeskiy.yreview.settings.ShareLog
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.AnchorRules
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NoteStore
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRoot
import com.yeskiy.yreview.store.StoreRules
import com.yeskiy.yreview.store.ideGitRunner
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryManager
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicInteger

/** Where one TODO line sits, so the task record names the file and the commit. */
private data class TodoPlace(val path: String, val filePath: String, val rootPath: String, val commit: String)

/** One TODO item before it gets its identifier, with its place in the file. */
private data class TodoHit(val offset: Int, val task: ReviewTask)

/** The tasks of one repository, and the commit they belong to. [outside] is the label of a root outside the project. */
data class RepositoryTasks(
    val root: VirtualFile,
    val commit: String,
    val tasks: List<ReviewTask>,
    val outside: String? = null,
)

/**
 * Reads the open tasks of a project.
 *
 * A review comment comes from the git notes of the repository. A TODO or a FIXME comes
 * from [PsiTodoSearchHelper], which is the same reader the built-in TODO view uses.
 *
 * Every method here reads git or the index, so the caller runs it off the user interface
 * thread.
 */
object TaskScan {

    /** How many full reads ran. The bench and the tests read it. */
    internal val reads = AtomicInteger()

    /** A test hook. When it is not 0, the folder part and the outside part sleep this many milliseconds first. */
    internal var partDelay: Long = 0

    /**
     * The tasks of every store of the project, one entry per git repository and per folder.
     *
     * [showResolved] comes from the toolbar switch of the tab that asks. The switch reaches
     * the scan, so the tab counts the rows it shows.
     *
     * Every repository root goes to every repository read, because a repository can stand
     * inside another one. The nearest root owns a file, and [AnchorRules.ownsFile] applies
     * that rule, so a TODO of an inner repository reaches the tree once.
     */
    fun read(project: Project, onlyFile: VirtualFile?, showResolved: Boolean = false): List<RepositoryTasks> {
        reads.incrementAndGet()
        val repositories = GitRepositoryManager.getInstance(project).repositories
        val roots = repositories.map { it.root.path }
        val parts: List<() -> List<RepositoryTasks>> = repositories.map { repository ->
            { listOfNotNull(repositoryTasks(project, repository, roots, onlyFile, showResolved)) }
        } + listOf({ folderTasks(project, onlyFile, showResolved) }, { outsideTasks(project, roots, onlyFile, showResolved) })
        return ParallelReads.map(parts, ProgressManager::checkCanceled) { it() }.flatten()
    }

    /** The TODO items that are still in the source. A root outside the project never reaches an agent. */
    fun openTodos(project: Project): List<ReviewTask> =
        read(project, null).filter { it.outside == null }.flatMap { it.tasks }.filter { it.kind == TaskKind.TODO }

    private fun repositoryTasks(
        project: Project,
        repository: GitRepository,
        roots: List<String>,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): RepositoryTasks? {
        if (onlyFile != null && !VfsUtilCore.isAncestor(repository.root, onlyFile, false)) return null
        val commit = TaskRevision.of(repository.currentRevision)
        val (comments, todos) = ParallelReads.map(
            listOf<() -> List<ReviewTask>>(
                { comments(project, repository.root, repository.currentRevision, onlyFile, showResolved) },
                { todos(project, repository.root, roots, commit, onlyFile) },
            ),
            ProgressManager::checkCanceled,
        ) { it() }
        return RepositoryTasks(repository.root, commit, withModules(project, comments + todos))
    }

    /**
     * The comments of every folder store, one entry per root.
     *
     * The entry carries no TODO item. A folder root usually contains the nested repositories,
     * and the TODO reader keeps every file under its root, so a TODO of a nested repository
     * would appear twice. A comment reaches exactly one store, so a comment cannot repeat.
     */
    internal fun folderTasks(
        project: Project,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<RepositoryTasks> {
        if (partDelay != 0L) Thread.sleep(partDelay)
        return ReviewService.getInstance(project).storeRoots()
            .filter { it.kind == StoreKind.FOLDER }
            .filter { onlyFile == null || VfsUtilCore.isAncestor(it.root, onlyFile, false) }
            .map { store ->
                RepositoryTasks(
                    store.root,
                    FolderStore.WORKTREE,
                    withModules(project, folderComments(project, store, onlyFile, showResolved)),
                )
            }
            .filter { it.tasks.isNotEmpty() }
    }

    /**
     * The tasks of each store root outside the project that has a file open in the editor.
     * An entry reads only its open files, so it runs no TODO index walk and no git search.
     */
    internal fun outsideTasks(
        project: Project,
        roots: List<String>,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<RepositoryTasks> {
        if (partDelay != 0L) Thread.sleep(partDelay)
        val service = ReviewService.getInstance(project)
        val open = FileEditorManager.getInstance(project).openFiles.toList()
            .filter { onlyFile == null || it == onlyFile }
        return OutsideRoots.of(open, insideRoots(project, roots), service::anchorOf, service.home()).mapNotNull { outside ->
            ProgressManager.checkCanceled()
            val root = LocalFileSystem.getInstance().findFileByPath(outside.root) ?: return@mapNotNull null
            val tasks = outsideComments(project, root, outside, showResolved) + outsideTodos(project, root, outside)
            tasks.takeIf { it.isNotEmpty() }
                ?.let { RepositoryTasks(root, outside.commit, it.map { task -> task.copy(outside = true) }, outside.label) }
        }
    }

    /** How many store roots outside the project have an open file. It reads the store cache only, so it starts no git. */
    fun outsideCount(project: Project): Int = cachedOutside(project) { null }.size

    /** The outside roots from the store cache. [miss] answers an open outside file that has no cached answer. */
    internal fun cachedOutside(project: Project, miss: (VirtualFile) -> AnchorResult?): List<OutsideRoot> {
        val service = ReviewService.getInstance(project)
        return OutsideRoots.of(
            FileEditorManager.getInstance(project).openFiles.toList(),
            insideRoots(project, GitRepositoryManager.getInstance(project).repositories.map { it.root.path }),
            { service.anchorOfCached(it) ?: miss(it) ?: AnchorResult.NoPlace },
            service.home(),
        )
    }

    /** The repository roots, the project folder and the content roots. */
    private fun insideRoots(project: Project, repositories: List<String>): List<String> =
        repositories + listOfNotNull(project.guessProjectDir()?.path) +
            ReadAction.compute<List<String>, RuntimeException> {
                ProjectRootManager.getInstance(project).contentRoots.map { it.path }
            }

    /** The store reads once, and each open file then takes its own comment rows. */
    private fun outsideComments(
        project: Project,
        root: VirtualFile,
        outside: OutsideRoot,
        showResolved: Boolean,
    ): List<ReviewTask> {
        val git = ideGitRunner(project, root)
        val notes = when {
            outside.kind == StoreKind.GIT -> NoteScan.read(git, root.path, NoteRefs.ALL) { ProgressManager.checkCanceled() }
                ?: NotesGateway(git)
            Files.isDirectory(Path.of(StoreRules.storeFolder(root.path))) ->
                ReviewService.getInstance(project).folderNotesOf(root)
            else -> return emptyList()
        }
        val log = ShareLog.getInstance(project)
        return outside.files.mapNotNull { VfsUtilCore.getRelativePath(it, root, '/') }.flatMap { path ->
            placedTasks(git, root.path, outside.commit, path, showResolved, log::isUnshared, notes) {
                ProgressManager.checkCanceled()
            }
        }
    }

    /** The TODO items of the open files of an outside root, read from the document text with the TODO patterns. */
    private fun outsideTodos(project: Project, root: VirtualFile, outside: OutsideRoot): List<ReviewTask> {
        val rules = TodoConfiguration.getInstance().todoPatterns
            .mapNotNull { pattern -> pattern.indexPattern.pattern?.let { TodoRule(pattern.patternString, it.toRegex()) } }
        val repository = TodoIds.repositoryOf(project.basePath, root.path)
        return ReadAction.compute<List<ReviewTask>, RuntimeException> {
            outside.files.filter { it.isValid }.flatMap { file ->
                val path = VfsUtilCore.getRelativePath(file, root, '/') ?: return@flatMap emptyList()
                val text = FileDocumentManager.getInstance().getDocument(file)?.text ?: return@flatMap emptyList()
                TodoIds.assign(
                    repository,
                    TodoLines.of(text, rules).map { hit -> outsideTodo(hit, path, file, root, outside.commit) },
                )
            }
        }
    }

    private fun outsideTodo(hit: TodoLine, path: String, file: VirtualFile, root: VirtualFile, commit: String): ReviewTask =
        ReviewTask(
            id = "",
            kind = TaskKind.TODO,
            path = path,
            startLine = hit.line,
            endLine = hit.line,
            text = hit.text,
            pattern = TodoWord.of(hit.text),
            patternRule = hit.rule,
            filePath = file.path,
            rootPath = root.path,
            revision = commit,
        )

    private fun folderComments(
        project: Project,
        store: StoreRoot,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<ReviewTask> {
        val log = ShareLog.getInstance(project)
        val wanted = onlyFile?.let { VfsUtilCore.getRelativePath(it, store.root, '/') }
        return placedTasks(
            ideGitRunner(project, store.root), store.root.path, FolderStore.WORKTREE, wanted, showResolved, log::isUnshared,
            notes = ReviewService.getInstance(project).folderNotesOf(store.root),
        )
    }

    /** The comment rows of one store. The open rows come from [PlacedComments], the same function the editor reads. */
    internal fun placedTasks(
        git: GitRunner,
        root: String,
        head: String?,
        path: String?,
        showResolved: Boolean,
        unshared: (String) -> Boolean,
        notes: NoteStore? = null,
        checkCanceled: () -> Unit = {},
    ): List<ReviewTask> {
        val store = notes ?: NoteScan.read(git, root, NoteRefs.ALL, checkCanceled) ?: NotesGateway(git)
        val open = PlacedComments.of(git, root, head, path, store, checkCanceled)
            .mapNotNull { CommentTask.of(ScanRecord(it.stored, false), root, unshared(it.stored.id), it.carry) }
        if (!showResolved) return open
        val book = CommentBook(store, author = "")
        return open + book.commits(NoteRefs.ALL).flatMap { book.closed(it, NoteRefs.ALL) }
            .filter { path == null || it.comment.location?.path == path }
            .mapNotNull { CommentTask.of(ScanRecord(it, true), root, unshared(it.id)) }
    }

    /** The module of every task, so the tree can put a module row above the files. */
    internal fun withModules(project: Project, tasks: List<ReviewTask>): List<ReviewTask> {
        if (tasks.isEmpty()) return tasks
        return ReadAction.nonBlocking<List<ReviewTask>> {
            val index = ProjectFileIndex.getInstance(project)
            tasks.map { task -> task.copy(module = moduleOf(index, task)) }
        }.inSmartMode(project).executeSynchronously()
    }

    private fun moduleOf(index: ProjectFileIndex, task: ReviewTask): String {
        if (task.filePath.isEmpty()) return ""
        val file = LocalFileSystem.getInstance().findFileByPath(task.filePath) ?: return ""
        return index.getModuleForFile(file)?.name.orEmpty()
    }

    internal fun comments(
        project: Project,
        root: VirtualFile,
        head: String?,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<ReviewTask> {
        val log = ShareLog.getInstance(project)
        val wanted = onlyFile?.let { VfsUtilCore.getRelativePath(it, root, '/') }
        return placedTasks(ideGitRunner(project, root), root.path, head, wanted, showResolved, log::isUnshared) {
            ProgressManager.checkCanceled()
        }
    }

    internal fun todos(
        project: Project,
        root: VirtualFile,
        roots: List<String>,
        commit: String,
        onlyFile: VirtualFile?,
    ): List<ReviewTask> =
        ReadAction.nonBlocking<List<ReviewTask>> {
            val helper = PsiTodoSearchHelper.getInstance(project)
            val repository = TodoIds.repositoryOf(project.basePath, root.path)
            val found = mutableListOf<ReviewTask>()
            if (onlyFile != null) {
                PsiManager.getInstance(project).findFile(onlyFile)
                    ?.let { found += fileTodos(helper, it, root, roots, commit, repository) }
            } else {
                helper.processFilesWithTodoItems(
                    Processor { file ->
                        found += fileTodos(helper, file, root, roots, commit, repository)
                        true
                    }
                )
            }
            found.toList()
        }.inSmartMode(project).executeSynchronously()

    /** The TODO items of one file. Each identifier needs the items before it, so the file reads whole. */
    internal fun fileTodos(
        helper: PsiTodoSearchHelper,
        file: PsiFile,
        root: VirtualFile,
        roots: List<String>,
        commit: String,
        repository: String,
    ): List<ReviewTask> {
        if (helper.getTodoItemsCount(file) == 0) return emptyList()
        val source = file.virtualFile ?: return emptyList()
        if (!AnchorRules.ownsFile(root.path, source.path, roots)) return emptyList()
        val path = VfsUtilCore.getRelativePath(source, root, '/') ?: return emptyList()
        val document = PsiDocumentManager.getInstance(file.project).getDocument(file) ?: return emptyList()
        val place = TodoPlace(path, source.path, root.path, commit)
        return TodoIds.assign(
            repository,
            helper.findTodoItems(file).mapNotNull { item -> todoHit(item, document, place) }
                .sortedBy { it.offset }
                .map { it.task },
        )
    }

    private fun todoHit(item: TodoItem, document: Document, place: TodoPlace): TodoHit? {
        val ranges = (listOf(item.textRange) + item.additionalTextRanges).filter { inside(document, it) }
        if (ranges.isEmpty()) return null
        val text = ranges.map { document.getText(it).trim() }.filter { it.isNotEmpty() }.joinToString(LINE_BREAK)
        if (text.isEmpty()) return null
        val startLine = document.getLineNumber(ranges.first().startOffset) + 1
        val endLine = document.getLineNumber(ranges.last().endOffset) + 1
        return TodoHit(
            ranges.first().startOffset,
            ReviewTask(
                id = "",
                kind = TaskKind.TODO,
                path = place.path,
                startLine = startLine,
                endLine = endLine,
                text = text,
                pattern = TodoWord.of(text),
                patternRule = item.pattern?.patternString.orEmpty(),
                filePath = place.filePath,
                rootPath = place.rootPath,
                revision = place.commit,
            ),
        )
    }

    private fun inside(document: Document, range: TextRange): Boolean =
        range.startOffset >= 0 && range.endOffset <= document.textLength && !range.isEmpty

    /** A multi-line TODO keeps its lines, so the tree can show the ones after the first. */
    private const val LINE_BREAK = "\n"
}

/**
 * The revision that the tasks of one repository carry.
 *
 * A repository that the user just started has no commit, and it still holds TODO lines. The
 * scan reads such a repository, and its tasks name the working tree, as the tasks of a
 * folder store do.
 */
object TaskRevision {

    fun of(head: String?): String = head ?: FolderStore.WORKTREE
}

/**
 * The word that starts a TODO line.
 *
 * The pattern of the platform is a regular expression, and a regular expression tells a
 * reader nothing. The first word of the line is the word the reader sees.
 */
object TodoWord {

    private val WORD = Regex("^[A-Za-z]+")

    fun of(text: String): String? = WORD.find(text.trimStart())?.value?.uppercase()
}
