package com.yeskiy.yreview.settings

import com.intellij.openapi.util.registry.Registry
import com.intellij.openapi.util.registry.RegistryValue

/**
 * The smallest size the main splitter keeps for the editor and for every tool window.
 *
 * A double click on the header of a tool window maximizes that window, and the splitter
 * stops the window at this size. A strip of the editor therefore stays above a bottom
 * window, and a column of the same width stays beside a side window. The value 0 removes
 * the strip. The IDE holds one such value for the whole frame, so no window of this plugin
 * can carry a value of its own.
 */
interface EditorStrip {

    /** The size the IDE holds now, in the form the IDE stores. */
    fun size(): String

    /** True while the size differs from the size of the IDE installation. */
    fun changedFromDefault(): Boolean

    fun set(size: String)

    /** Drops the size of the user, and the size of the IDE installation stands again. */
    fun reset()

    companion object {
        /** The key of the size. The file misc/registry.properties gives it the value 30. */
        const val KEY = "ide.mainSplitter.min.size"

        /** The size that leaves no strip. The IDE takes a value from 0 to 100. */
        const val NONE = "0"
    }
}

/**
 * The size, as the registry of the IDE holds it.
 *
 * The class com.intellij.toolWindow.ToolWindowPane listens to this key and lays the
 * splitter out again with the new size, so a change needs no restart. That work belongs to
 * the user interface thread, and every write of this object goes to that thread.
 */
object RegistryStrip : EditorStrip {

    override fun size(): String = value().asString()

    override fun changedFromDefault(): Boolean = value().isChangedFromDefault()

    override fun set(size: String) = value().setValue(size)

    override fun reset() = value().resetToDefault()

    private fun value(): RegistryValue = Registry.get(EditorStrip.KEY)
}
