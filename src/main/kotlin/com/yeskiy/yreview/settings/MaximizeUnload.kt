package com.yeskiy.yreview.settings

import com.intellij.ide.plugins.DynamicPluginListener
import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.yeskiy.yreview.session.ChannelServer

/**
 * Puts the size of the main splitter back before this plugin leaves the IDE.
 *
 * The maximize switch writes a key of the whole IDE. Every other write of the plugin sits
 * inside the plugin, so this one key is the only state that would stay behind. A user who
 * turns the plugin off, or removes it, would keep a layout rule with no plugin left to
 * explain it.
 *
 * The IDE calls this before it unloads any plugin, so the step reads the descriptor and
 * answers for this plugin alone.
 */
class MaximizeUnload : DynamicPluginListener {

    override fun beforePluginUnload(pluginDescriptor: IdeaPluginDescriptor, isUpdate: Boolean) {
        if (pluginDescriptor.pluginId.idString != ChannelServer.PLUGIN_ID) return
        MaximizeSettings.getInstance().unload()
    }
}
