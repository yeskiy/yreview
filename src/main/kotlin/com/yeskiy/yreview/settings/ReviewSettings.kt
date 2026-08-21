package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.session.ClaudeCommand
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

        /** True while the plugin may open the bridge port and push a task to a session. */
        @JvmField
        var channel: Boolean = true

        /**
         * Whether the Claude tool window appears. A null value means that the user never
         * chose, and then the search for a Claude installation decides.
         */
        @JvmField
        var sessionWindow: Boolean? = null

        /**
         * The command a review session runs. Every machine holds Claude Code in its own
         * place, so the default names the launcher every installer writes to the PATH.
         */
        @JvmField
        var claudeCommand: String = ClaudeCommand.DEFAULT_COMMAND

        /**
         * The path of the channel server, or an empty string. The plugin ships no copy of
         * that Node program, so it cannot fill this field on its own.
         */
        @JvmField
        var channelServer: String = ""

        @JvmField
        var projectTab: TabState = TabState()

        @JvmField
        var currentFileTab: TabState = TabState()

        @JvmField
        var scopeTab: TabState = TabState()

        @JvmField
        var changeListTab: TabState = TabState()
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

    var channel: Boolean
        get() = current.channel
        set(value) {
            current.channel = value
        }

    /** The choice of the user about the Claude tool window, or null while nobody chose. */
    var sessionWindow: Boolean?
        get() = current.sessionWindow
        set(value) {
            current.sessionWindow = value
        }

    /** The command of a review session. A blank field falls back to the default. */
    var claudeCommand: String
        get() = current.claudeCommand.trim().ifEmpty { ClaudeCommand.DEFAULT_COMMAND }
        set(value) {
            current.claudeCommand = value.trim().ifEmpty { ClaudeCommand.DEFAULT_COMMAND }
        }

    /** The path of the channel server, or an empty string while nobody named one. */
    var channelServer: String
        get() = current.channelServer.trim()
        set(value) {
            current.channelServer = value.trim()
        }

    /** True when the Claude tool window may appear. An unset choice follows the search. */
    fun sessionWindowShown(claudeFound: Boolean): Boolean = current.sessionWindow ?: claudeFound

    /** The view state of one tab. Every toolbar action of that tab reads and writes it. */
    fun tab(scope: TaskScope): TabState = when (scope) {
        TaskScope.PROJECT -> current.projectTab
        TaskScope.CURRENT_FILE -> current.currentFileTab
        TaskScope.SCOPE_BASED -> current.scopeTab
        TaskScope.CHANGE_LIST -> current.changeListTab
    }

    companion object {
        fun getInstance(project: Project): ReviewSettings = project.service()
    }
}

/** The three group toggles of one tab, as the tree reads them. */
fun ReviewSettings.TabState.grouping(): TaskGrouping =
    TaskGrouping(byModule, byDirectory, flattenDirectories)
