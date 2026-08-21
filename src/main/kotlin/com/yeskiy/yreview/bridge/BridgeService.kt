package com.yeskiy.yreview.bridge

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import git4idea.repo.GitRepositoryManager
import java.io.IOException

/**
 * Owns the bridge of one project.
 *
 * The server starts the first time the tool window opens or a comment is written, and it
 * stops when the project closes. A project that never reviews anything never listens on a
 * port.
 */
@Service(Service.Level.PROJECT)
class BridgeService(private val project: Project) : Disposable {

    private val lock = Any()

    private var server: BridgeServer? = null

    private var discovery: DiscoveryFile? = null

    @Volatile
    private var address: BridgeAddress? = null

    /** Starts the server once. Returns where it listens, or null when it cannot start. */
    fun start(): BridgeAddress? {
        synchronized(lock) {
            address?.let { return it }
            val basePath = project.basePath ?: return null
            val started = BridgeServer(::resolveIds)
            val where = try {
                started.start()
            } catch (failure: IOException) {
                logger.warn("the review bridge did not open a port", failure)
                return null
            }
            val file = DiscoveryFile.forProject(basePath)
            try {
                file.write(BridgeEntry(where.url, where.token, basePath, ProcessHandle.current().pid()))
            } catch (failure: IOException) {
                started.stop()
                logger.warn("the review bridge did not write the file a session reads", failure)
                return null
            }
            server = started
            discovery = file
            address = where
            return where
        }
    }

    /** Starts the server away from the user interface thread, because it opens a port. */
    fun startLater() {
        ApplicationManager.getApplication().executeOnPooledThread { start() }
    }

    private fun startedServer(): BridgeServer? {
        start()
        return server
    }

    fun stop() {
        synchronized(lock) {
            discovery?.let { file -> runCatching { file.delete() } }
            discovery = null
            server?.stop()
            server = null
            address = null
        }
    }

    override fun dispose() = stop()

    /** Reads the open comments of one repository and pushes them to every connected session. */
    fun sendOpenComments(root: VirtualFile): SendReport {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForRootQuick(root)
            ?: return SendReport(0, 0, 0, "The folder ${root.name} is not a git repository.")
        val commit = repository.currentRevision
            ?: return SendReport(0, 0, 0, "The repository ${root.name} has no commit yet.")
        val running = startedServer()
            ?: return SendReport(0, 0, 0, "The review bridge is not running.")

        val book = ReviewService.getInstance(project).bookForRoot(root)
        val batches = BatchBuilder().build(
            repository.currentBranch?.name.orEmpty(),
            commit,
            book.commits(NoteRefs.ALL).flatMap { book.open(it, NoteRefs.ALL) },
        )
        val streams = running.streamCount()
        batches.forEach { running.send(it) }
        return SendReport(batches.sumOf { it.comments.size }, batches.size, streams)
    }

    /**
     * Marks every id the session reports. The ids arrive checked, so each one is a comment
     * id and nothing else. A missing id gives the session a reason it can show the model.
     */
    private fun resolveIds(ids: List<String>): String? {
        val service = ReviewService.getInstance(project)
        val roots = GitRepositoryManager.getInstance(project).repositories.map { it.root }
        val problems = ids.mapNotNull { id -> problemOf(service, roots, id) }
        return if (problems.isEmpty()) null else problems.joinToString(" ")
    }

    private fun problemOf(service: ReviewService, roots: List<VirtualFile>, id: String): String? {
        val hit = roots.firstNotNullOfOrNull { root -> service.bookForRoot(root).find(id)?.let { root to it } }
            ?: return "The IDE holds no comment with the id $id."
        return try {
            service.resolveComment(hit.first, hit.second)
            null
        } catch (failure: NotesWriteException) {
            "The IDE could not resolve $id. ${failure.message}"
        }
    }

    companion object {
        private val logger = logger<BridgeService>()

        fun getInstance(project: Project): BridgeService = project.service()
    }
}
