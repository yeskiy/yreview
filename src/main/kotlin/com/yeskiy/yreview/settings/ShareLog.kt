package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

/**
 * Holds the comments that reached a shared ref but never reached the remote. The tool window
 * marks such a row as not shared, so a failed push stays visible after the dialog is gone.
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

    class State {
        @JvmField
        var unshared: MutableList<String> = mutableListOf()
    }

    private val lock = Any()

    private var current = State()

    override fun getState(): State = synchronized(lock) {
        State().also { copy -> copy.unshared = current.unshared.toMutableList() }
    }

    override fun loadState(state: State) {
        synchronized(lock) { current = state }
    }

    fun isUnshared(id: String): Boolean = synchronized(lock) { id in current.unshared }

    fun markUnshared(id: String) {
        synchronized(lock) { if (id !in current.unshared) current.unshared.add(id) }
    }

    /**
     * One push carries every note of the ref. The plugin pushes only the discuss ref, so one
     * success puts every marked comment on the remote.
     */
    fun clear() {
        synchronized(lock) { current.unshared.clear() }
    }

    companion object {
        fun getInstance(project: Project): ShareLog = project.service()
    }
}
