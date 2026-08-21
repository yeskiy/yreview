package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
@State(name = "YReviewSettings", storages = [Storage("y-review.xml")])
class ReviewSettings : PersistentStateComponent<ReviewSettings.State> {

    class State {
        @JvmField
        var sharing: CommentSharing = CommentSharing.LOCAL_ONLY

        @JvmField
        var currentFileOnly: Boolean = false
    }

    private var current = State()

    override fun getState(): State = current

    override fun loadState(state: State) {
        current = state
    }

    var sharing: CommentSharing
        get() = current.sharing
        set(value) {
            current.sharing = value
        }

    /** True when the review tool window shows the tasks of the open file only. */
    var currentFileOnly: Boolean
        get() = current.currentFileOnly
        set(value) {
            current.currentFileOnly = value
        }

    companion object {
        fun getInstance(project: Project): ReviewSettings = project.service()
    }
}
