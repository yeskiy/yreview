package com.yeskiy.yreview.tasks

import com.intellij.openapi.editor.Document
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.search.PsiTodoSearchHelper
import com.intellij.psi.search.TodoItem
import com.intellij.util.Processor
import com.yeskiy.yreview.settings.ShareLog
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
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

    /** The tasks of every git repository of the project, one entry per repository. */
    fun read(project: Project, onlyFile: VirtualFile?): List<RepositoryTasks> =
        GitRepositoryManager.getInstance(project).repositories.mapNotNull { repository ->
            repositoryTasks(project, repository, onlyFile)
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
        onlyFile: VirtualFile?,
    ): RepositoryTasks? {
        val commit = repository.currentRevision ?: return null
        if (onlyFile != null && !VfsUtilCore.isAncestor(repository.root, onlyFile, false)) return null
        return RepositoryTasks(
            repository.root,
            commit,
            comments(project, repository.root, onlyFile) + todos(project, repository.root, commit, onlyFile),
        )
    }

    private fun comments(project: Project, root: VirtualFile, onlyFile: VirtualFile?): List<ReviewTask> {
        val book = ReviewService.getInstance(project).bookForRoot(root)
        val log = ShareLog.getInstance(project)
        val wanted = onlyFile?.let { VfsUtilCore.getRelativePath(it, root, '/') }
        return book.commits(NoteRefs.ALL)
            .flatMap { book.open(it, NoteRefs.ALL) }
            .mapNotNull { stored -> taskOf(stored, root, log.isUnshared(stored.id)) }
            .filter { wanted == null || it.path == wanted }
    }

    private fun taskOf(stored: StoredComment, root: VirtualFile, unshared: Boolean): ReviewTask? {
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
            state = state(stored, unshared),
        )
    }

    /** A comment of the local ref is never shared, so a failed push cannot change its state. */
    private fun state(stored: StoredComment, unshared: Boolean): String = when {
        !NoteRefs.isShared(stored.ref) -> "local"
        unshared -> "not shared"
        else -> "shared"
    }

    private fun todos(
        project: Project,
        root: VirtualFile,
        commit: String,
        onlyFile: VirtualFile?,
    ): List<ReviewTask> =
        ReadAction.nonBlocking<List<ReviewTask>> {
            val helper = PsiTodoSearchHelper.getInstance(project)
            val found = mutableListOf<ReviewTask>()
            if (onlyFile != null) {
                PsiManager.getInstance(project).findFile(onlyFile)
                    ?.let { found += fileTodos(helper, it, root, commit) }
            } else {
                helper.processFilesWithTodoItems(
                    Processor { file ->
                        found += fileTodos(helper, file, root, commit)
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
        commit: String,
    ): List<ReviewTask> {
        if (helper.getTodoItemsCount(file) == 0) return emptyList()
        val source = file.virtualFile ?: return emptyList()
        if (!VfsUtilCore.isAncestor(root, source, false)) return emptyList()
        val path = VfsUtilCore.getRelativePath(source, root, '/') ?: return emptyList()
        val document = PsiDocumentManager.getInstance(file.project).getDocument(file) ?: return emptyList()
        return helper.findTodoItems(file)
            .mapNotNull { item -> todoTask(item, document, TodoPlace(path, source.path, root.path, commit)) }
    }

    private fun todoTask(item: TodoItem, document: Document, place: TodoPlace): ReviewTask? {
        val ranges = (listOf(item.textRange) + item.additionalTextRanges).filter { inside(document, it) }
        if (ranges.isEmpty()) return null
        val text = ranges.map { document.getText(it).trim() }.filter { it.isNotEmpty() }.joinToString(" ")
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
            filePath = place.filePath,
            rootPath = place.rootPath,
            revision = place.commit,
        )
    }

    private fun inside(document: Document, range: TextRange): Boolean =
        range.startOffset >= 0 && range.endOffset <= document.textLength && !range.isEmpty
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
