package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

/**
 * Holds the folder store roots that the user already knows about.
 *
 * The plugin explains the folder once for each root. A message on every write would say
 * nothing new, and the user would learn to ignore it.
 */
@Service(Service.Level.PROJECT)
@State(name = "YReviewFolderNotice", storages = [Storage("y-review.xml")])
class FolderNoticeLog : PersistentStateComponent<FolderNoticeLog.State> {

    class State {
        @JvmField
        var told: MutableList<String> = mutableListOf()
    }

    private var current = State()

    override fun getState(): State = current

    override fun loadState(state: State) {
        current = state
    }

    fun told(rootPath: String): Boolean = rootPath in current.told

    fun markTold(rootPath: String) {
        if (!told(rootPath)) current.told.add(rootPath)
    }

    companion object {
        fun getInstance(project: Project): FolderNoticeLog = project.service()
    }
}
