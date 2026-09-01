package com.yeskiy.yreview.tasks

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment

/** What one delete of review comments did. */
data class RemoveReport(val removed: Int, val problems: List<String> = emptyList()) {

    val problem: String? get() = problems.joinToString(" ").ifEmpty { null }
}

/**
 * Deletes review comments from the git notes.
 *
 * A comment is one line of a note in the git-appraise format. A delete reads the note of
 * the commit, drops the matching line, and writes the note again. The other lines stay byte
 * for byte, and the note ref stays valid.
 *
 * A TODO never reaches this class, because a TODO lives in the source file and not in a
 * note. Every method here runs git, so the caller runs it off the user interface thread.
 */
@Service(Service.Level.PROJECT)
class TaskRemoval(private val project: Project) {

    fun delete(ids: List<String>): RemoveReport {
        val wanted = ids.distinct().filterNot { TaskIds.isTodo(it) }.toSet()
        if (wanted.isEmpty()) return RemoveReport(0)
        val service = ReviewService.getInstance(project)
        val found = service.storeRoots()
            .map { it.root }
            .associateWith { root -> service.bookForRoot(root).findAll(wanted) }
            .filterValues { it.isNotEmpty() }
        return found
            .map { (root, records) -> deleteFrom(service, root, records) }
            .fold(RemoveReport(0, missing(wanted, found.values.flatten()))) { report, next ->
                RemoveReport(report.removed + next.removed, report.problems + next.problems)
            }
    }

    private fun missing(wanted: Set<String>, found: List<StoredComment>): List<String> =
        wanted.filterNot { id -> found.any { it.id == id } }
            .map { "The IDE holds no comment with the id $it." }

    private fun deleteFrom(
        service: ReviewService,
        root: VirtualFile,
        records: List<StoredComment>,
    ): RemoveReport = try {
        service.deleteComments(root, records)
            .let { RemoveReport(it.removed, listOfNotNull(it.shareError)) }
    } catch (failure: NotesWriteException) {
        RemoveReport(0, listOf("The IDE could not write the note of ${root.name}. ${failure.message}"))
    }

    companion object {
        fun getInstance(project: Project): TaskRemoval = project.service()
    }
}
