package com.yeskiy.ideareview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

/**
 * Holds the comments that reached a shared ref but never reached the remote. The tool window
 * marks such a row as not shared, so a failed push stays visible after the dialog is gone.
 */
@Service(Service.Level.PROJECT)
@State(name = "IdeaReviewShareLog", storages = [Storage("idea-review.xml")])
class ShareLog : PersistentStateComponent<ShareLog.State> {

    class State {
        @JvmField
        var unshared: MutableList<String> = mutableListOf()
    }

    private var current = State()

    override fun getState(): State = current

    override fun loadState(state: State) {
        current = state
    }

    fun isUnshared(id: String): Boolean = id in current.unshared

    fun markUnshared(id: String) {
        if (!isUnshared(id)) current.unshared.add(id)
    }

    /**
     * One push carries every note of the ref. The plugin pushes only the discuss ref, so one
     * success puts every marked comment on the remote.
     */
    fun clear() {
        current.unshared.clear()
    }

    companion object {
        fun getInstance(project: Project): ShareLog = project.service()
    }
}
