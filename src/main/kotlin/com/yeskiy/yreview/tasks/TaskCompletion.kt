package com.yeskiy.yreview.tasks

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment
import git4idea.repo.GitRepositoryManager

/** What one batch of reported identifiers did. */
data class CloseReport(val closed: Int, val problems: List<String> = emptyList()) {

    val problem: String? get() = problems.joinToString(" ").ifEmpty { null }

    val quiet: Boolean get() = closed == 0 && problems.isEmpty()
}

private sealed interface CommentOutcome {

    data object Closed : CommentOutcome

    data object Already : CommentOutcome

    data class Problem(val text: String) : CommentOutcome
}

/**
 * Closes the tasks an agent reports as finished.
 *
 * Both routes end here. The channel sends the identifiers over the bridge, and an agent
 * outside Claude Code appends them to done.txt.
 *
 * A comment becomes a resolve record in the git notes. A TODO has no record, because the
 * agent closes it when the agent removes the line. The plugin only reports a TODO that is
 * still in the source.
 *
 * An identifier that arrives twice writes nothing the second time. The done file keeps its
 * whole history, so the same line reaches this class again after a restart of the IDE.
 */
@Service(Service.Level.PROJECT)
class TaskCompletion(private val project: Project) {

    fun close(ids: List<String>): CloseReport {
        val (todos, comments) = ids.distinct().partition { TaskIds.isTodo(it) }
        val outcomes = closeComments(comments)
        val stillOpen = openTodoIds(todos)
        return CloseReport(
            closed = outcomes.count { it is CommentOutcome.Closed } + todos.size - stillOpen.size,
            problems = outcomes.filterIsInstance<CommentOutcome.Problem>().map { it.text } +
                stillOpen.map { "The line of the task $it is still in the source." },
        )
    }

    private fun closeComments(ids: List<String>): List<CommentOutcome> {
        if (ids.isEmpty()) return emptyList()
        val service = ReviewService.getInstance(project)
        val roots = GitRepositoryManager.getInstance(project).repositories.map { it.root }
        return ids.map { id -> outcomeOf(service, roots, id) }
    }

    private fun outcomeOf(service: ReviewService, roots: List<VirtualFile>, id: String): CommentOutcome {
        val hit = roots.firstNotNullOfOrNull { root -> service.bookForRoot(root).find(id)?.let { root to it } }
            ?: return CommentOutcome.Problem("The IDE holds no comment with the id $id.")
        if (isClosed(service.bookForRoot(hit.first), hit.second)) return CommentOutcome.Already
        return try {
            service.resolveComment(hit.first, hit.second)
            CommentOutcome.Closed
        } catch (failure: NotesWriteException) {
            CommentOutcome.Problem("The IDE could not resolve $id. ${failure.message}")
        }
    }

    private fun isClosed(book: CommentBook, stored: StoredComment): Boolean {
        val commit = stored.comment.location?.commit ?: return false
        return book.closed(commit).any { it.id == stored.id }
    }

    private fun openTodoIds(ids: List<String>): List<String> {
        if (ids.isEmpty()) return emptyList()
        val open = TaskScan.openTodoIds(project)
        return ids.filter { it in open }
    }

    companion object {
        fun getInstance(project: Project): TaskCompletion = project.service()
    }
}
