package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.tasks.HandleMatch
import com.yeskiy.yreview.tasks.TaskHandles

/**
 * Holds the comments that reached a shared ref but never reached the remote. The tool window
 * marks such a row as not shared, so a failed push stays visible after the dialog is gone.
 *
 * A mark names the root and the ref of the push that would carry the comment. One project
 * can hold several git repositories with different remotes, and each ref of a repository
 * takes a push of its own.
 *
 * A mark comes from the thread that draws the window, from a progress thread, from the
 * bridge and from the watch of the done files. A read comes from the scan of the tool
 * window and from the store of the IDE. One lock therefore guards every entry point. The
 * state that the store reads is a copy. The store therefore never walks a list that a mark
 * changes.
 */
@Service(Service.Level.PROJECT)
@State(name = "YReviewShareLog", storages = [Storage("y-review.xml")])
class ShareLog : PersistentStateComponent<ShareLog.State> {

    /** One comment that never reached the remote, and the push that would carry it. */
    class Mark(
        @JvmField var id: String = "",
        @JvmField var root: String = "",
        @JvmField var ref: String = "",
    )

    /** The identifier a record had before a move into the git notes, and the identifier it has now. */
    class Rename(
        @JvmField var from: String = "",
        @JvmField var to: String = "",
    )

    class State {
        /** The identifiers an older version wrote. Such an entry names no push. */
        @JvmField
        var unshared: MutableList<String> = mutableListOf()

        @JvmField
        var marks: MutableList<Mark> = mutableListOf()

        @JvmField
        var renames: MutableList<Rename> = mutableListOf()
    }

    private val lock = Any()

    private var current = State()

    override fun getState(): State = synchronized(lock) {
        State().also { copy ->
            copy.marks = current.marks.toMutableList()
            copy.renames = current.renames.toMutableList()
        }
    }

    /** A file of an older version holds plain identifiers, and each one becomes a mark of no push. */
    override fun loadState(state: State) {
        synchronized(lock) {
            current = state
            current.marks.addAll(current.unshared.map { Mark(it) })
            current.unshared = mutableListOf()
        }
    }

    fun isUnshared(id: String): Boolean = synchronized(lock) { current.marks.any { it.id == id } }

    fun markUnshared(id: String, root: String, ref: String) {
        synchronized(lock) {
            if (current.marks.none { it.id == id }) current.marks.add(Mark(id, root, ref))
        }
    }

    /**
     * Drops the marks that one push carried.
     *
     * One push carries every note of one ref of one root. A comment of another root or of
     * another ref keeps its mark, because no push carried that comment. A mark of an older
     * version names no push, so the first push that works clears it.
     */
    fun clear(root: String, ref: String) {
        synchronized(lock) {
            current.marks.removeAll { (it.root == root && it.ref == ref) || it.root.isEmpty() }
        }
    }

    /** Gives each moved record its new identifier and the root of the repository that now holds it. */
    fun rename(renames: Map<String, String>, newRoot: String) {
        if (renames.isEmpty()) return
        synchronized(lock) {
            current.marks.filter { it.id in renames }.forEach { mark ->
                mark.id = renames.getValue(mark.id)
                mark.root = newRoot
            }
            current.renames.removeAll { it.from in renames }
            current.renames.addAll(renames.map { (from, to) -> Rename(from, to) })
            current.renames = current.renames.takeLast(MAX_RENAMES).toMutableList()
        }
    }

    /** The new identifier for an old identifier or its handle. Every other value comes back unchanged. */
    fun forward(given: String): String {
        val key = TaskHandles.keyOf(given) ?: return given
        val renames = synchronized(lock) { current.renames.toList() }
        return when (val match = TaskHandles.match(key, renames.map { it.from })) {
            is HandleMatch.One -> renames.last { it.from == match.id }.to
            else -> given
        }
    }

    companion object {
        const val MAX_RENAMES = 5_000

        fun getInstance(project: Project): ShareLog = project.service()
    }
}
