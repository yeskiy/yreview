package com.yeskiy.yreview.settings

import com.intellij.ide.plugins.DynamicPluginListener
import com.intellij.openapi.util.JDOMUtil
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The plugin declares the step that puts the size of the main splitter back.
 *
 * The maximize switch writes a key of the whole IDE, and the IDE keeps that key after the
 * plugin is gone. The platform reads the class and the topic of a listener by name, so a
 * rename or a lost declaration compiles and every other test still passes. This test reads
 * the descriptor itself and loads the class it names.
 */
class MaximizeUnloadTest {

    @Test
    fun `the descriptor declares the listener for the plugin unload topic`() {
        assertTrue(
            listenerClasses().contains(MaximizeUnload::class.java.name),
            "No $PLUGIN_XML declares ${MaximizeUnload::class.java.name} for the topic $TOPIC.",
        )
    }

    @Test
    fun `the class the descriptor names listens to the plugin unload`() {
        val name = listenerClasses().firstOrNull { it.startsWith(PLUGIN_PACKAGE) }
            ?: fail("No $PLUGIN_XML of this plugin declares a listener for $TOPIC.")
        val made = runCatching { Class.forName(name).getDeclaredConstructor().newInstance() }
            .getOrElse { fail("$PLUGIN_XML names the class $name, and that class does not load. $it") }

        assertTrue(made is DynamicPluginListener, "$name is no DynamicPluginListener.")
    }

    /**
     * The classes that the descriptor names for the unload topic.
     *
     * The platform puts a descriptor of its own under the same name, so the search reads
     * every copy on the test classpath.
     */
    private fun listenerClasses(): List<String> =
        javaClass.classLoader.getResources(PLUGIN_XML).asSequence()
            .flatMap { runCatching { listenersIn(it.readText()) }.getOrDefault(emptyList()).asSequence() }
            .toList()

    private fun listenersIn(text: String): List<String> =
        JDOMUtil.load(text)
            .getChildren("applicationListeners")
            .flatMap { it.getChildren("listener") }
            .filter { it.getAttributeValue("topic") == TOPIC }
            .mapNotNull { it.getAttributeValue("class")?.takeIf { name -> name.isNotBlank() } }

    private companion object {
        const val PLUGIN_XML = "META-INF/plugin.xml"
        const val TOPIC = "com.intellij.ide.plugins.DynamicPluginListener"
        const val PLUGIN_PACKAGE = "com.yeskiy.yreview."
    }
}
