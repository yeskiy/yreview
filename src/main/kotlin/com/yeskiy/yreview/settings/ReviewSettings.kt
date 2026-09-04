package com.yeskiy.yreview.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.session.ClaudeCommand
import com.yeskiy.yreview.store.NotesSharing
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

        /**
         * True while the preview pane stands beside the tree.
         *
         * A tab that nobody changed opens the pane. The store writes this field only when
         * the value differs from the default, so a stored false keeps the pane closed.
         */
        @JvmField
        var showPreview: Boolean = true

        /** The identifier of the scope the Scope Based tab shows. The other tabs leave it empty. */
        @JvmField
        var scopeId: String = ""

        /**
         * True while the tree also lists the comments that somebody already resolved.
         *
         * A second pass over a review needs the answered comments, and a first pass does
         * not. The switch therefore belongs to one tab, as the kind filter does.
         */
        @JvmField
        var showResolved: Boolean = false
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

        /** The git remote that a shared note goes to. Not every repository names it origin. */
        @JvmField
        var remote: String = DEFAULT_REMOTE

        /** True while the plugin may add the notes refspec to the git configuration of the user. */
        @JvmField
        var writeRefspec: Boolean = true

        /** True while an open editor shows the comment icon and the comment background. */
        @JvmField
        var editorMarks: Boolean = true

        /** True while the session tool window starts a session as soon as it opens. */
        @JvmField
        var autoStartSession: Boolean = true

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

    /** The git remote of a shared note. A blank field falls back to the default. */
    var remote: String
        get() = current.remote.trim().ifEmpty { DEFAULT_REMOTE }
        set(value) {
            current.remote = value.trim().ifEmpty { DEFAULT_REMOTE }
        }

    var writeRefspec: Boolean
        get() = current.writeRefspec
        set(value) {
            current.writeRefspec = value
        }

    var editorMarks: Boolean
        get() = current.editorMarks
        set(value) {
            current.editorMarks = value
        }

    var autoStartSession: Boolean
        get() = current.autoStartSession
        set(value) {
            current.autoStartSession = value
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

        /** The remote of a fresh clone. A blank field on the settings page falls back to it. */
        const val DEFAULT_REMOTE = NotesSharing.DEFAULT_REMOTE

        fun getInstance(project: Project): ReviewSettings = project.service()
    }
}

/** The three group toggles of one tab, as the tree reads them. */
fun ReviewSettings.TabState.grouping(): TaskGrouping =
    TaskGrouping(byModule, byDirectory, flattenDirectories)
