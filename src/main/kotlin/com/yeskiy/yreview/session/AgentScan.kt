package com.yeskiy.yreview.session

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.util.EnvironmentUtil
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Holds the answer of one search for the installed agents.
 *
 * The answer belongs to the machine, so one search serves the whole application. The
 * search runs away from the user interface thread, because the platform reads the shell
 * environment on the first call and that call can wait about 20 seconds.
 *
 * A caller reads [latest] and draws at once. The answer says whether a search has finished,
 * so a screen can show that the search still runs.
 */
@Service(Service.Level.APP)
class AgentScan {

    /** The installs the last search found, and whether any search finished. */
    data class Answer(val installs: Map<AgentId, AgentInstall>, val scanned: Boolean) {

        fun of(id: AgentId): AgentInstall = installs[id] ?: AgentInstall.NOTHING

        val anyFound: Boolean get() = installs.values.any { it.found }

        companion object {
            val NOT_YET = Answer(emptyMap(), scanned = false)
        }
    }

    @Volatile
    private var answer: Answer = Answer.NOT_YET

    private val running = AtomicBoolean(false)

    /** Everybody who asked for the answer of the search that runs right now. */
    private val waiting = CopyOnWriteArrayList<(Answer) -> Unit>()

    fun latest(): Answer = answer

    /**
     * Starts one search on a pooled thread, and calls [onDone] on that same thread.
     *
     * A second call during a search starts no second search, and it still hears the
     * answer. The tool window starts a search while the project opens, and the panel of a
     * session asks again a moment later, so a dropped answer would leave that panel
     * waiting for a search that nobody runs again. The caller moves the answer to the user
     * interface thread itself.
     */
    fun refresh(onDone: (Answer) -> Unit = {}) {
        waiting.add(onDone)
        if (!running.compareAndSet(false, true)) return
        ApplicationManager.getApplication().executeOnPooledThread {
            val fresh = runCatching { search() }.getOrElse { Answer(emptyMap(), scanned = true) }
            answer = fresh
            running.set(false)
            val heard = waiting.toList()
            waiting.removeAll(heard)
            heard.forEach { it(fresh) }
        }
    }

    /**
     * The platform reads the shell environment on macOS, so this PATH is the PATH of the
     * terminal of the user. System.getenv would give the login PATH there.
     */
    private fun search(): Answer {
        val platform = AgentFolders.platformOf(System.getProperty("os.name").orEmpty())
        return Answer(
            AgentSearch.all(
                specs = AgentCatalog.ALL,
                path = EnvironmentUtil.getValue(PATH_VARIABLE),
                pathExt = EnvironmentUtil.getValue(EXTENSION_VARIABLE),
                windows = platform == Platform.WINDOWS,
                folders = AgentFolders.of(platform, AgentFolders.places()),
                runnable = ::runnable,
                exists = { Files.isRegularFile(it) },
            ),
            scanned = true,
        )
    }

    /** A file that the operating system can start. The search reports such a file only. */
    private fun runnable(file: Path): Boolean =
        Files.isRegularFile(file) && Files.isReadable(file) && Files.isExecutable(file)

    companion object {

        const val PATH_VARIABLE = "PATH"

        const val EXTENSION_VARIABLE = "PATHEXT"

        fun getInstance(): AgentScan = ApplicationManager.getApplication().service<AgentScan>()
    }
}
