package com.yeskiy.yreview.bridge

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.session.SessionReach
import com.yeskiy.yreview.session.SessionRegistry
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

    /**
     * Pushes the given tasks of one repository to the session named by [target], or to
     * every connected session when [target] is null.
     *
     * A target that left the bridge between the choice of the user and this call reaches
     * zero streams. The report then carries the name, so the notice can say which session
     * went away.
     */
    fun sendTasks(root: VirtualFile, tasks: List<ReviewTask>, target: String? = null): SendReport {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForRootQuick(root)
            ?: return SendReport(0, 0, 0, "The folder ${root.name} is not a git repository.")
        val commit = repository.currentRevision
            ?: return SendReport(0, 0, 0, "The repository ${root.name} has no commit yet.")
        val running = startedServer()
            ?: return SendReport(0, 0, 0, "The review bridge is not running.")

        val plan = BatchBuilder().build(repository.currentBranch?.name.orEmpty(), commit, tasks)
        reportLoss(plan)
        val reached = plan.batches.maxOfOrNull { running.send(it, target) } ?: 0
        return SendReport(
            tasks = plan.tasks,
            batches = plan.batches.size,
            streams = reached,
            dropped = plan.dropped.size,
            dropReason = plan.reason.ifEmpty { null },
            targetName = target?.let { nameOf(it) },
        )
    }

    /**
     * The sessions of the tool window that a send can reach right now, in the order of the
     * tabs.
     *
     * The reach of each session decides, and never the open stream set alone. A session
     * that reaches the bridge through the channel counts only while its channel server
     * holds a stream. A session that reads a port of its own counts while its tab lives.
     * A session that takes no send never counts.
     */
    fun liveChoices(): List<SessionChoice> {
        val open = startedServer()?.openKeys().orEmpty().toSet()
        return SessionRegistry.getInstance(project).entries()
            .filter { it.reach.takesSend(streamOpen = it.key in open) }
            .map { SessionChoice(it.key, it.name) }
    }

    /** How many sessions a send can reach, over any transport. Zero means the copy route. */
    fun reachableCount(): Int = liveChoices().size

    /**
     * How many sessions can take a send right now, over any transport.
     *
     * A session of this window is the only receiver. The plugin starts such a session with
     * the flag that opens a channel, and a session that the plugin did not start drops a
     * push in silence. [readerCount] must never feed the route, because it counts streams
     * and a session that answers a loopback port of its own opens none.
     */
    fun receiverCount(): Int = reachableCount()

    /** How a send gets to one session. Nothing reaches a null key or an unknown one. */
    fun reachOf(key: String?): SessionReach =
        key?.let { SessionRegistry.getInstance(project).reachOf(it) } ?: SessionReach.None

    /**
     * Puts one prompt into a session that runs an HTTP server of its own.
     *
     * The bridge carries nothing here. The plugin posts straight to the port of that
     * session, so this report names one stream after a good push and none after a bad one.
     * A good answer proves that the server of the session took the text, and it does not
     * prove that the session showed it.
     */
    fun pushText(key: String, tasks: Int, text: String): SendReport {
        val reach = reachOf(key)
        if (reach !is SessionReach.LocalHttp) {
            return SendReport(0, 0, 0, "That session is no longer open.", targetName = nameOf(key))
        }
        val problem = OpenCodeClient.push(reach.port, reach.password, text)
        return SendReport(
            tasks = if (problem == null) tasks else 0,
            batches = 0,
            streams = if (problem == null) 1 else 0,
            problem = problem,
            targetName = nameOf(key),
        )
    }

    private fun nameOf(key: String): String? = SessionRegistry.getInstance(project).nameOf(key)

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
     * The log names the session, because several sessions can close a comment of one
     * project and the user must be able to read who did it.
     */
    private fun resolveIds(ids: List<String>, session: String?): String? {
        val report = TaskCompletion.getInstance(project).close(ids)
        if (report.closed > 0) {
            logger.info("the review bridge closed ${report.closed} tasks for ${session ?: "a session with no key"}")
        }
        return report.problem
    }

    companion object {
        private val logger = logger<BridgeService>()

        fun getInstance(project: Project): BridgeService = project.service()
    }
}
