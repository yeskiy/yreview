package com.yeskiy.yreview.toolwindow

import com.intellij.openapi.util.JDOMUtil
import com.intellij.openapi.wm.ToolWindowFactory
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Each descriptor names a factory class that exists and that opens during indexing.
 *
 * The platform reads the factoryClass attribute by name, and it builds no window when that
 * name is wrong. A rename that misses a descriptor therefore compiles, and every other test
 * still passes. These tests read the name out of the descriptor itself, load that class,
 * and ask the platform the same question that the platform asks about the index.
 */
class ToolWindowDescriptorTest {

    @Test
    fun `the review window descriptor names a factory that opens while the index builds`() =
        assertOpensWhileIndexing(PLUGIN_XML, "Yreview")

    @Test
    fun `the session window descriptor names a factory that opens while the index builds`() =
        assertOpensWhileIndexing(TERMINAL_XML, "Yreview Session")

    private fun assertOpensWhileIndexing(descriptor: String, windowId: String) {
        val name = factoryClassOf(descriptor, windowId)
        val made = runCatching { Class.forName(name).getDeclaredConstructor().newInstance() }
            .getOrElse { fail("$descriptor names the class $name for $windowId, and that class does not load. $it") }
        val factory = made as? ToolWindowFactory ?: fail("$name is no ToolWindowFactory.")
        assertTrue(factory.isDumbAware, "$name does not open while the IDE builds the index.")
    }

    /**
     * The factoryClass of one window, read from the descriptor on the test classpath.
     *
     * The platform puts a descriptor of its own under the same name, so the search reads
     * every copy and keeps the copy that declares this window.
     */
    private fun factoryClassOf(descriptor: String, windowId: String): String =
        javaClass.classLoader.getResources(descriptor).asSequence()
            .mapNotNull { runCatching { factoryIn(it.readText(), windowId) }.getOrNull() }
            .firstOrNull()
            ?: fail("No $descriptor on the test classpath declares the window $windowId with a factoryClass.")

    private fun factoryIn(text: String, windowId: String): String? =
        JDOMUtil.load(text)
            .getChildren("extensions")
            .flatMap { it.getChildren("toolWindow") }
            .firstOrNull { it.getAttributeValue("id") == windowId }
            ?.getAttributeValue("factoryClass")
            ?.takeIf { it.isNotBlank() }

    private companion object {
        const val PLUGIN_XML = "META-INF/plugin.xml"
        const val TERMINAL_XML = "META-INF/y-review-terminal.xml"
    }
}
