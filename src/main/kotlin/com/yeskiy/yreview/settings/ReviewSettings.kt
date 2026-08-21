package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.tasks.TaskGrouping

@Service(Service.Level.PROJECT)
@State(name = "YReviewSettings", storages = [Storage("y-review.xml")])
class ReviewSettings : PersistentStateComponent<ReviewSettings.State> {

    class State {
        @JvmField
        var sharing: CommentSharing = CommentSharing.LOCAL_ONLY

        @JvmField
        var currentFileOnly: Boolean = false

        @JvmField
        var byModule: Boolean = false

        @JvmField
        var byDirectory: Boolean = false

        @JvmField
        var flattenDirectories: Boolean = false

        @JvmField
        var todoFilterName: String = ""

        @JvmField
        var autoScrollToSource: Boolean = false

        @JvmField
        var showPreview: Boolean = false
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

    /** True when the review tool window groups the files under their module. */
    var byModule: Boolean
        get() = current.byModule
        set(value) {
            current.byModule = value
        }

    /** True when the review tool window shows a directory tree above the files. */
    var byDirectory: Boolean
        get() = current.byDirectory
        set(value) {
            current.byDirectory = value
        }

    /** True when one row holds a whole directory path. It works with [byDirectory] only. */
    var flattenDirectories: Boolean
        get() = current.flattenDirectories
        set(value) {
            current.flattenDirectories = value
        }

    /** The name of the chosen TODO filter. An empty name shows every TODO. */
    var todoFilterName: String
        get() = current.todoFilterName
        set(value) {
            current.todoFilterName = value
        }

    var autoScrollToSource: Boolean
        get() = current.autoScrollToSource
        set(value) {
            current.autoScrollToSource = value
        }

    var showPreview: Boolean
        get() = current.showPreview
        set(value) {
            current.showPreview = value
        }

    /** The three group toggles, as the tree reads them. */
    val grouping: TaskGrouping
        get() = TaskGrouping(current.byModule, current.byDirectory, current.flattenDirectories)

    companion object {
        fun getInstance(project: Project): ReviewSettings = project.service()
    }
}
