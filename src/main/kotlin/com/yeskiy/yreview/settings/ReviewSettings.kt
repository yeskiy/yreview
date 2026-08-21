package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.tasks.TaskGrouping
import com.yeskiy.yreview.tasks.TaskKindFilter
import com.yeskiy.yreview.tasks.TaskScope

@Service(Service.Level.PROJECT)
@State(name = "YReviewSettings", storages = [Storage("y-review.xml")])
class ReviewSettings : PersistentStateComponent<ReviewSettings.State> {

    /**
     * The view state of one tab of the review tool window.
     *
     * The built-in TODO window keeps one such record per tab, and the review window does the
     * same. A group toggle of one tab therefore leaves the other tabs alone.
     */
    class TabState {
        @JvmField
        var byModule: Boolean = false

        @JvmField
        var byDirectory: Boolean = false

        @JvmField
        var flattenDirectories: Boolean = false

        @JvmField
        var todoFilterName: String = ""

        @JvmField
        var kindFilter: TaskKindFilter = TaskKindFilter.BOTH

        @JvmField
        var autoScrollToSource: Boolean = false

        @JvmField
        var showPreview: Boolean = false

        /** The identifier of the scope the Scope Based tab shows. The other tabs leave it empty. */
        @JvmField
        var scopeId: String = ""
    }

    class State {
        @JvmField
        var sharing: CommentSharing = CommentSharing.LOCAL_ONLY

        @JvmField
        var projectTab: TabState = TabState()

        @JvmField
        var currentFileTab: TabState = TabState()

        @JvmField
        var scopeTab: TabState = TabState()
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

    /** The view state of one tab. Every toolbar action of that tab reads and writes it. */
    fun tab(scope: TaskScope): TabState = when (scope) {
        TaskScope.PROJECT -> current.projectTab
        TaskScope.CURRENT_FILE -> current.currentFileTab
        TaskScope.SCOPE_BASED -> current.scopeTab
    }

    companion object {
        fun getInstance(project: Project): ReviewSettings = project.service()
    }
}

/** The three group toggles of one tab, as the tree reads them. */
fun ReviewSettings.TabState.grouping(): TaskGrouping =
    TaskGrouping(byModule, byDirectory, flattenDirectories)
