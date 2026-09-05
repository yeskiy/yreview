package com.yeskiy.yreview.tasks

import com.intellij.openapi.editor.Document
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
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
import com.yeskiy.yreview.store.AnchorRules
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRoot
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryManager

/** Where one TODO line sits, so the task record names the file and the commit. */
private data class TodoPlace(val path: String, val filePath: String, val rootPath: String, val commit: String)

/** The tasks of one repository, and the commit they belong to. */
data class RepositoryTasks(val root: VirtualFile, val commit: String, val tasks: List<ReviewTask>)

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
        val repositories = GitRepositoryManager.getInstance(project).repositories
        val roots = repositories.map { it.root.path }
        return repositories.mapNotNull { repository ->
            repositoryTasks(project, repository, roots, onlyFile, showResolved)
        } + folderTasks(project, onlyFile, showResolved)
    }

    /** The identifiers of the TODO lines that are still in the source. */
    fun openTodoIds(project: Project): Set<String> =
        read(project, null).flatMap { it.tasks }
            .filter { it.kind == TaskKind.TODO }
            .map { it.id }
            .toSet()

    private fun repositoryTasks(
        project: Project,
        repository: GitRepository,
        roots: List<String>,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): RepositoryTasks? {
        if (onlyFile != null && !VfsUtilCore.isAncestor(repository.root, onlyFile, false)) return null
        val commit = TaskRevision.of(repository.currentRevision)
        return RepositoryTasks(
            repository.root,
            commit,
            withModules(
                project,
                comments(project, repository.root, onlyFile, showResolved) +
                    todos(project, repository.root, roots, commit, onlyFile),
            ),
        )
    }

    /**
     * The comments of every folder store, one entry per root.
     *
     * The entry carries no TODO item. A folder root usually contains the nested repositories,
     * and the TODO reader keeps every file under its root, so a TODO of a nested repository
     * would appear twice. A comment reaches exactly one store, so a comment cannot repeat.
     */
    private fun folderTasks(
        project: Project,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<RepositoryTasks> =
        ReviewService.getInstance(project).storeRoots()
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

    private fun folderComments(
        project: Project,
        store: StoreRoot,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<ReviewTask> {
        val log = ShareLog.getInstance(project)
        val wanted = onlyFile?.let { VfsUtilCore.getRelativePath(it, store.root, '/') }
        return records(ReviewService.getInstance(project).bookFor(store), showResolved)
            .mapNotNull { record -> taskOf(record, store.root, log.isUnshared(record.stored.id)) }
            .filter { wanted == null || it.path == wanted }
    }

    /** The records of one store, as the switch of the tab asks for them. */
    private fun records(book: CommentBook, showResolved: Boolean): List<ScanRecord> =
        book.commits(NoteRefs.ALL).flatMap { commit ->
            CommentPick.of(
                book.open(commit, NoteRefs.ALL),
                if (showResolved) book.closed(commit, NoteRefs.ALL) else emptyList(),
                showResolved,
            )
        }

    /** The module of every task, so the tree can put a module row above the files. */
    private fun withModules(project: Project, tasks: List<ReviewTask>): List<ReviewTask> {
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

    private fun comments(
        project: Project,
        root: VirtualFile,
        onlyFile: VirtualFile?,
        showResolved: Boolean,
    ): List<ReviewTask> {
        val log = ShareLog.getInstance(project)
        val wanted = onlyFile?.let { VfsUtilCore.getRelativePath(it, root, '/') }
        return records(ReviewService.getInstance(project).bookForRoot(root), showResolved)
            .mapNotNull { record -> taskOf(record, root, log.isUnshared(record.stored.id)) }
            .filter { wanted == null || it.path == wanted }
    }

    private fun taskOf(record: ScanRecord, root: VirtualFile, unshared: Boolean): ReviewTask? {
        val stored = record.stored
        val location = stored.comment.location ?: return null
        val text = stored.comment.description?.trim().orEmpty()
        if (text.isEmpty()) return null
        return ReviewTask(
            id = stored.id,
            kind = TaskKind.COMMENT,
            path = location.path,
            startLine = location.range?.startLine ?: 0,
            endLine = location.range?.endLine ?: 0,
            text = text,
            author = stored.comment.author,
            filePath = "${root.path}/${location.path}",
            rootPath = root.path,
            revision = location.commit,
            state = CommentWord.of(
                shared = NoteRefs.isShared(stored.ref),
                worktree = stored.commit == FolderStore.WORKTREE,
                unshared = unshared,
                resolved = record.resolved,
            ),
        )
    }

    private fun todos(
        project: Project,
        root: VirtualFile,
        roots: List<String>,
        commit: String,
        onlyFile: VirtualFile?,
    ): List<ReviewTask> =
        ReadAction.nonBlocking<List<ReviewTask>> {
            val helper = PsiTodoSearchHelper.getInstance(project)
            val found = mutableListOf<ReviewTask>()
            if (onlyFile != null) {
                PsiManager.getInstance(project).findFile(onlyFile)
                    ?.let { found += fileTodos(helper, it, root, roots, commit) }
            } else {
                helper.processFilesWithTodoItems(
                    Processor { file ->
                        found += fileTodos(helper, file, root, roots, commit)
                        true
                    }
                )
            }
            found.toList()
        }.inSmartMode(project).executeSynchronously()

    private fun fileTodos(
        helper: PsiTodoSearchHelper,
        file: PsiFile,
        root: VirtualFile,
        roots: List<String>,
        commit: String,
    ): List<ReviewTask> {
        if (helper.getTodoItemsCount(file) == 0) return emptyList()
        val source = file.virtualFile ?: return emptyList()
        if (!AnchorRules.ownsFile(root.path, source.path, roots)) return emptyList()
        val path = VfsUtilCore.getRelativePath(source, root, '/') ?: return emptyList()
        val document = PsiDocumentManager.getInstance(file.project).getDocument(file) ?: return emptyList()
        return helper.findTodoItems(file)
            .mapNotNull { item -> todoTask(item, document, TodoPlace(path, source.path, root.path, commit)) }
    }

    private fun todoTask(item: TodoItem, document: Document, place: TodoPlace): ReviewTask? {
        val ranges = (listOf(item.textRange) + item.additionalTextRanges).filter { inside(document, it) }
        if (ranges.isEmpty()) return null
        val text = ranges.map { document.getText(it).trim() }.filter { it.isNotEmpty() }.joinToString(LINE_BREAK)
        if (text.isEmpty()) return null
        val startLine = document.getLineNumber(ranges.first().startOffset) + 1
        val endLine = document.getLineNumber(ranges.last().endOffset) + 1
        return ReviewTask(
            id = TaskIds.forTodo(place.path, startLine),
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
