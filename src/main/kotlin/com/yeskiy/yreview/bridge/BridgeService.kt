package com.yeskiy.yreview.bridge

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskCompletion
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

    /**
     * Starts the server once. Returns where it listens, or null when it cannot start.
     *
     * The switch of the settings page comes first, so a closed channel opens no port at
     * all. Every caller of the bridge reaches the port through this one method.
     */
    fun start(): BridgeAddress? {
        if (!ReviewSettings.getInstance(project).channel) return null
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

    /**
     * The number of sessions that read the channel right now.
     *
     * Zero means that the channel cannot carry a task, so the caller writes the files of
     * the file protocol and copies the prompt instead.
     */
    fun readerCount(): Int = startedServer()?.streamCount() ?: 0

    /**
     * Applies the channel switch now. A closed switch gives the port back and removes the
     * file that a session reads, so no session finds a dead address.
     */
    fun applySwitch(enabled: Boolean) {
        when {
            !enabled -> stop()
            GitRepositoryManager.getInstance(project).repositories.isNotEmpty() -> startLater()
        }
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

    /** Pushes the given tasks of one repository to every connected session. */
    fun sendTasks(root: VirtualFile, tasks: List<ReviewTask>): SendReport {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForRootQuick(root)
            ?: return SendReport(0, 0, 0, "The folder ${root.name} is not a git repository.")
        val commit = repository.currentRevision
            ?: return SendReport(0, 0, 0, "The repository ${root.name} has no commit yet.")
        val running = startedServer()
            ?: return SendReport(0, 0, 0, "The review bridge is not running.")

        val plan = BatchBuilder().build(repository.currentBranch?.name.orEmpty(), commit, tasks)
        reportLoss(plan)
        val streams = running.streamCount()
        plan.batches.forEach { running.send(it) }
        return SendReport(
            tasks = plan.tasks,
            batches = plan.batches.size,
            streams = streams,
            dropped = plan.dropped.size,
            dropReason = plan.reason.ifEmpty { null },
        )
    }

    /** A task the channel refuses is a loss, so the log names every identifier it lost. */
    private fun reportLoss(plan: BatchPlan) {
        if (plan.dropped.isEmpty()) return
        logger.warn(
            "the review bridge dropped ${plan.dropped.size} tasks: " +
                plan.dropped.joinToString(", ") { "${it.id} (${it.reason})" }
        )
    }

    /**
     * Closes every identifier the session reports. [ResolveRequest] checks each one first,
     * so an identifier that arrives here is a comment id or a todo id and nothing else.
     */
    private fun resolveIds(ids: List<String>): String? = TaskCompletion.getInstance(project).close(ids).problem

    companion object {
        private val logger = logger<BridgeService>()

        fun getInstance(project: Project): BridgeService = project.service()
    }
}
