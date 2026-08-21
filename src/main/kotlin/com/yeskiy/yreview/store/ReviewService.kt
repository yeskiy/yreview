package com.yeskiy.yreview.store

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ShareLog
import git4idea.repo.GitRepositoryManager

/** The comment that was written, and the reason the push failed when it did. */
data class CommentWriteResult(val stored: StoredComment, val shareError: String?)

/** How many note lines a delete removed, and the reason the push failed when it did. */
data class CommentDeleteResult(val removed: Int, val shareError: String?)

@Service(Service.Level.PROJECT)
class ReviewService(private val project: Project) {

    fun bookForRoot(root: VirtualFile): CommentBook {
        val runner = ideGitRunner(project, root)
        return CommentBook(NotesGateway(runner), author = authorOf(runner))
    }

    fun bookFor(file: VirtualFile): CommentBook? = repositoryRoot(file)?.let { bookForRoot(it) }

    fun headOf(file: VirtualFile): String? =
        GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)?.currentRevision

    fun relativePath(file: VirtualFile): String? {
        val root = repositoryRoot(file)?.path ?: return null
        if (!file.path.startsWith("$root/")) return null
        return file.path.removePrefix("$root/")
    }

    fun repositoryRoot(file: VirtualFile): VirtualFile? =
        GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)?.root

    fun addComment(
        root: VirtualFile,
        ref: String,
        commit: String,
        path: String,
        startLine: Int,
        endLine: Int,
        text: String,
    ): CommentWriteResult = finish(root, bookForRoot(root).add(ref, commit, path, startLine, endLine, text))

    fun resolveComment(root: VirtualFile, stored: StoredComment): CommentWriteResult =
        finish(root, bookForRoot(root).resolve(stored))

    /**
     * Removes these comments from the git notes and pushes every shared ref they touched.
     *
     * A delete is final, because the plugin keeps no copy of the removed line. A failed
     * push leaves the note where it is, and the next successful push carries the change.
     */
    fun deleteComments(root: VirtualFile, records: List<StoredComment>): CommentDeleteResult {
        val removed = bookForRoot(root).remove(records)
        if (removed == 0) return CommentDeleteResult(0, null)
        val errors = records.map { it.ref }.distinct()
            .filter { NoteRefs.isShared(it) }
            .mapNotNull { runShare(root, it).takeIf { result -> !result.ok }?.message }
        BridgeService.getInstance(project).startLater()
        notifyChanged()
        return CommentDeleteResult(removed, errors.joinToString(" ").ifEmpty { null })
    }

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
        val result = runShare(root, stored.ref)
        val log = ShareLog.getInstance(project)
        if (result.ok) {
            log.clear()
            return null
        }
        log.markUnshared(stored.id)
        return result.message
    }

    private fun runShare(root: VirtualFile, ref: String): ShareResult {
        val task = ThrowableComputable<ShareResult, RuntimeException> {
            NotesSharing(ideGitRunner(project, root)).share(ref)
        }
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

    private fun authorOf(runner: GitRunner): String =
        runner.run("config", "user.email").stdout.trim().ifEmpty { "unknown" }

    companion object {
        fun getInstance(project: Project): ReviewService = project.service()
    }
}
