package com.yeskiy.yreview.settings

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.session.AgentId
import com.yeskiy.yreview.session.AgentLaunch

/**
 * The width of the box that prints the arguments of a session.
 *
 * The box holds one command, and a real machine gives long paths to it. A box that asks
 * for the width of its longest line makes the settings dialog wider than the screen. The
 * user then has to move sideways to read a sentence.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class ArgumentAreaTest : BasePlatformTestCase() {

    fun `test the command of an agent that registers itself stays inside the page`() {
        assertFits(AgentLaunch.appendedText(AgentId.ANTIGRAVITY, JAVA, SERVER))
    }

    fun `test the document of an agent that keeps a file stays inside the page`() {
        assertFits(AgentLaunch.appendedText(AgentId.CURSOR, JAVA, SERVER))
    }

    fun `test the flags of the agent that carries the channel stay inside the page`() {
        assertFits(AgentLaunch.appendedText(AgentId.CLAUDE, JAVA, SERVER))
    }

    /**
     * The box gets the width of the page, and it may ask for no more.
     *
     * The text must come back with every character, because the user copies this command.
     * A wrap that writes a line break into the box would break the copy.
     */
    private fun assertFits(text: String) {
        val area = ArgumentArea.build()
        area.text = text
        area.setSize(PAGE_WIDTH, PAGE_HEIGHT)

        assertTrue(
            "The box asks for ${area.preferredSize.width} pixels of a page of $PAGE_WIDTH pixels.",
            area.preferredSize.width <= PAGE_WIDTH,
        )
        assertEquals(text, area.text)
    }

    private companion object {
        const val PAGE_WIDTH = 600
        const val PAGE_HEIGHT = 400
        const val JAVA = "/home/reviewer/.local/share/JetBrains/Toolbox/apps/intellij-idea-ultimate/jbr/bin/java"
        const val SERVER =
            "/home/reviewer/.local/share/JetBrains/IntelliJIdea2026.2/y-review/channel/y-review-channel.jar"
    }
}
