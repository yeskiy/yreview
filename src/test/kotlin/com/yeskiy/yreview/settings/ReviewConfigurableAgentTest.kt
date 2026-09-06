package com.yeskiy.yreview.settings

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.session.AgentCatalog
import com.yeskiy.yreview.session.AgentId
import com.yeskiy.yreview.session.AgentSpec
import java.awt.Component
import java.awt.Container
import javax.swing.JComboBox
import javax.swing.JComponent

/**
 * What the settings page does with the agent of a project where nobody chose one.
 *
 * The box of the page always names one agent, because a combo box cannot show an empty
 * choice. A project with no choice therefore shows the default of the catalog. That
 * picture is no choice of the user. A user who opens the page to read it, and then presses
 * OK to close it, must leave the choice empty, and the session window must keep its
 * selector.
 *
 * A user who picks an agent in the box does settle the choice. The pick of the agent that
 * the box already shows counts as well, because the box fires that pick like any other.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class ReviewConfigurableAgentTest : BasePlatformTestCase() {

    private var earlier: AgentId? = null

    private var root: JComponent? = null

    override fun setUp() {
        super.setUp()
        earlier = settings().agent
        settings().agent = null
    }

    override fun tearDown() {
        try {
            settings().agent = earlier
        } finally {
            super.tearDown()
        }
    }

    fun `test a page that nobody touched reports no change`() {
        val page = open()

        assertFalse("The page reported a change that the user never made.", page.isModified())
    }

    fun `test a page that nobody touched writes no agent`() {
        val page = open()

        page.apply()

        assertNull("The page wrote an agent that the user never chose.", settings().agent)
    }

    fun `test a pick of the agent the box shows counts as a change`() {
        val page = open()

        pickShownAgent()

        assertTrue("The page reported no change after the user picked an agent.", page.isModified())
    }

    fun `test a pick of the agent the box shows writes that agent`() {
        val page = open()

        pickShownAgent()
        page.apply()

        assertEquals(AgentCatalog.DEFAULT, settings().agent)
    }

    /** Builds the page as the platform does, and answers the page itself. */
    private fun open(): ReviewConfigurable {
        val page = ReviewConfigurable(project)
        root = page.createComponent()
        page.reset()
        return page
    }

    /** Repeats the pick a user makes when the box already names the agent they want. */
    private fun pickShownAgent() {
        val box = agentBox(root) ?: throw AssertionError("The page holds no box of agents.")
        box.selectedItem = box.selectedItem
    }

    /** The one box of the page whose items are agents. The other box holds the sharing choice. */
    private fun agentBox(part: Component?): JComboBox<*>? = when {
        part is JComboBox<*> && part.itemCount > 0 && part.getItemAt(0) is AgentSpec -> part
        part is Container -> part.components.firstNotNullOfOrNull { agentBox(it) }
        else -> null
    }

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)
}
