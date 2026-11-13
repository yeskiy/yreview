package com.yeskiy.yreview.session

import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.terminal.TerminalTitle
import com.intellij.terminal.frontend.view.TerminalView
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.toolWindow.ToolWindowHeadlessManagerImpl
import com.intellij.ui.content.ContentFactory
import com.yeskiy.yreview.settings.ReviewSettings

/**
 * The window title of a terminal, and the tab that reads it.
 *
 * Nine agents write the name of their session into the window title of the terminal. The
 * session reports every title, the reader of the agent turns that text into a name, and
 * the tab shows it. These tests run that whole route with a real terminal title.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class TerminalTitleTabTest : BasePlatformTestCase() {

    private lateinit var window: ToolWindow

    private lateinit var title: TerminalTitle

    private lateinit var session: ReviewSession

    override fun setUp() {
        super.setUp()
        window = ToolWindowHeadlessManagerImpl.MockToolWindow(project)
        title = TerminalTitle()
        val contents = ContentFactory.getInstance().createContentManager(false, project)
        session = ReviewSession(titleOnlyView(title), contents)
    }

    override fun tearDown() {
        try {
            session.close()
        } finally {
            super.tearDown()
        }
    }

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)

    private fun openTabs() {
        val made = SessionTabs(project, window)
        Disposer.register(testRootDisposable, made)
        made.open(start = false)
    }

    /** The text that the platform wrote on the first tab. */
    private fun label(): String = window.contentManager.getContent(0)!!.displayName!!

    private fun panel(): SessionPanel =
        window.contentManager.getContent(0)!!.component as SessionPanel

    /**
     * Hands the window title of the terminal to the tab, as the mount of a session does.
     *
     * The mount reads the raw title through the reader of the agent, and it gives the
     * answer to the panel. These two steps run here, so the test covers the whole route
     * from the terminal to the tab.
     */
    private fun nameTheTabFromTheTitle(agent: AgentId) {
        val panel = panel()
        session.watchTitle { raw -> panel.nameFromAgent(AgentTitle.of(AgentCatalog.of(agent), raw)) }
    }

    fun `test the session reports every new window title of the terminal`() {
        val seen = mutableListOf<String?>()

        session.watchTitle { raw -> seen += raw }
        title.change { applicationTitle = FIRST }
        title.change { applicationTitle = FIRST }
        title.change { applicationTitle = SECOND }

        // The first report carries the title of the moment of the subscription, and the
        // terminal holds none yet. A repeat write of one title reports nothing, because
        // the terminal compares the new state with the old one.
        assertEquals(listOf(null, FIRST, SECOND), seen)
    }

    fun `test the window title of the terminal names the tab`() {
        settings().agent = AgentId.CLAUDE
        openTabs()
        nameTheTabFromTheTitle(AgentId.CLAUDE)
        assertEquals("Claude 1 (not started)", label())

        // Claude Code writes one spinner character, a space, and the name of the session.
        title.change { applicationTitle = "${AgentTitle.CLAUDE_SPINNERS.first()} fix the parser" }

        assertEquals("fix the parser (not started)", label())
    }

    private companion object {
        const val FIRST = "the first name"
        const val SECOND = "the second name"
    }
}

/**
 * A terminal view that carries a window title and nothing else.
 *
 * Every other member throws, so a call that these tests do not expect fails loudly.
 */
private fun titleOnlyView(title: TerminalTitle): TerminalView =
    fakeTerminalView(
        mapOf("getTitle" to title),
        "This terminal view carries a window title and nothing else.",
    )
