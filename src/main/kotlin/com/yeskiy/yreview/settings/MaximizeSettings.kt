package com.yeskiy.yreview.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

/**
 * The switch that lets a maximized tool window cover the editor completely.
 *
 * The switch writes one size that belongs to the whole IDE, so the state stands beside the
 * application and not beside a project. Two open projects then read one switch, and they
 * never disagree about that one size.
 */
@Service(Service.Level.APP)
@State(name = "YReviewMaximize", storages = [Storage("y-review.xml")])
class MaximizeSettings : PersistentStateComponent<MaximizeSettings.State> {

    class State {
        /** True while a maximized tool window covers the editor completely. */
        @JvmField
        var full: Boolean = false

        /**
         * The size the IDE held before the user set this switch to on. An empty text says
         * that the user held no size, and then the size of the IDE installation stands
         * again. The plugin keeps this size, because the user can hold a size that the IDE
         * installation never had.
         */
        @JvmField
        var previous: String = ""
    }

    private var current = State()

    override fun getState(): State = current

    override fun loadState(state: State) {
        current = state
    }

    val full: Boolean
        get() = current.full

    /**
     * Moves the switch and writes the size at once.
     *
     * The plugin writes the size only for the step that moves the switch. While the switch
     * stands off, the plugin never writes the size, and the size of the user stays.
     */
    fun switch(on: Boolean, strip: EditorStrip = RegistryStrip) {
        if (on == current.full) return
        current.full = on
        if (on) {
            current.previous = if (strip.changedFromDefault()) strip.size() else ""
            hide(strip)
        } else {
            restore(strip)
        }
    }

    /**
     * Writes the size again after a start of the IDE.
     *
     * The IDE keeps the size in its own file, so a plain restart holds it. A user who
     * restores the configuration of the IDE, or who writes the key by hand, drops it. This
     * step then writes the size of the switch again. The step keeps the earlier size of the
     * user, because only the step that moves the switch reads that size.
     */
    fun start(strip: EditorStrip = RegistryStrip) {
        if (current.full) hide(strip)
    }

    private fun hide(strip: EditorStrip) {
        if (strip.size() != EditorStrip.NONE) strip.set(EditorStrip.NONE)
    }

    private fun restore(strip: EditorStrip) {
        val previous = current.previous
        current.previous = ""
        if (previous.isEmpty()) strip.reset() else strip.set(previous)
    }

    companion object {
        fun getInstance(): MaximizeSettings = ApplicationManager.getApplication().service<MaximizeSettings>()
    }
}
