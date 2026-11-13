package com.yeskiy.yreview.handoff

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRoot
import com.yeskiy.yreview.store.ideGitRunner
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskHandles
import com.yeskiy.yreview.tasks.TaskIds
import com.yeskiy.yreview.tasks.TaskJson
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TodoMigration
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * The identifiers that one project window handed to an agent.
 *
 * Every send and every copy writes tasks.json into the review folder of the window, so that
 * file names the tasks which really left this window. One done file serves every window of
 * one repository, therefore an identifier can arrive from a window that this project never
 * sent. The file tells the two apart.
 *
 * The file holds the tasks of the last send alone, because every send replaces it. A task
 * that is still open reaches every later send again, so the record of an open task stands.
 *
 * An agent works in the same folder, so this file is input the plugin does not trust. A
 * file that the reader cannot use answers with nothing. The caller then proves no hand-out,
 * and it claims no finished task.
 */
object SentTasks {

    /** One read never takes more than this. A larger file answers with nothing. */
    const val MAX_BYTES = 1L shl 22

    private val LOG = Logger.getInstance(SentTasks::class.java)

    /**
     * The handles of every store of the project, in one set.
     *
     * The lookup answers a read of an agent, so it moves no folder store. It moves an older
     * task file to the TODO identifiers of the [open] items first, see [migrate].
     */
    fun of(project: Project, open: List<ReviewTask>): Set<String> =
        ReviewService.getInstance(project).storeRoots(migrate = false)
            .mapNotNull { folderOf(project, it) }
            .map { it.resolve(HandoffFiles.TASKS_NAME) }
            .onEach { migrate(it, open) }
            .flatMap { handles(it) }
            .toSet()

    /**
     * Writes an older task file again with current TODO identifiers. The file version marks
     * a migrated file, so this runs once. A file that the reader cannot use stays as it is.
     */
    fun migrate(file: Path, open: List<ReviewTask>, maxBytes: Long = MAX_BYTES) {
        val document = runCatching { if (Files.size(file) > maxBytes) null else TaskJson.decode(Files.readString(file)) }
            .getOrNull() ?: return
        if (document.version >= TodoMigration.VERSION) return
        try {
            HandoffFiles(file.parent).writeTasks(TodoMigration.migrate(document, open))
        } catch (failure: IOException) {
            LOG.info("the review plugin did not migrate a task file", failure)
        }
    }

    /**
     * The handles of one task file.
     *
     * A file of a build before the short handle holds the long identifier of a task, so
     * every value reads through [TaskHandles.of] and both forms answer the same handle.
     *
     * A TODO entry also gives the handle an older build made for its path and line. An agent
     * can still report that value after the migration, and it then names the same entry.
     */
    fun handles(file: Path, maxBytes: Long = MAX_BYTES): Set<String> = runCatching {
        if (Files.size(file) > maxBytes) emptySet() else read(file)
    }.getOrDefault(emptySet())

    private fun read(file: Path): Set<String> =
        TaskJson.decode(Files.readString(file)).tasks.flatMap { task ->
            listOfNotNull(
                TaskHandles.of(task.id),
                if (task.kind == TaskKind.TODO) TaskHandles.of(TaskIds.legacyTodo(task.path, task.startLine)) else null,
            )
        }.toSet()

    /** The review folder of this project window, by the rule that the send follows. */
    private fun folderOf(project: Project, store: StoreRoot): Path? = HandoffPlace.of(
        store.kind,
        Path.of(store.root.path),
        if (store.kind == StoreKind.GIT) GitDir.of(ideGitRunner(project, store.root)) else null,
        project.basePath.orEmpty(),
    )
}
