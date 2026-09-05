package com.yeskiy.yreview.session

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.openapi.ui.TestInputDialog
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.toolWindow.ToolWindowHeadlessManagerImpl
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.settings.ReviewSettings

/**
 * The tabs of the session window, as the platform really builds them.
 *
 * The fixture holds a project in memory, so every test here reads the text that the
 * content manager carries. No test starts a terminal. A tab carries a name before any
 * session runs, and that is the part these tests cover.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class SessionTabsTest : BasePlatformTestCase() {

    private lateinit var window: ToolWindow

    override fun setUp() {
        super.setUp()
        window = ToolWindowHeadlessManagerImpl.MockToolWindow(project)
    }

    override fun tearDown() {
        try {
            TestDialogManager.setTestInputDialog(TestInputDialog.DEFAULT)
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    private fun settings(): ReviewSettings = ReviewSettings.getInstance(project)

    private fun openTabs(): SessionTabs {
        val made = SessionTabs(project, window)
        Disposer.register(testRootDisposable, made)
        made.open(start = false)
        return made
    }

    /** The text that the platform wrote on the first tab. */
    private fun label(): String = window.contentManager.getContent(0)!!.displayName!!

    /** The text that the platform shows when the pointer rests on the first tab. */
    private fun tooltip(): String = window.contentManager.getContent(0)!!.description!!

    private fun panel(): SessionPanel =
        window.contentManager.getContent(0)!!.component as SessionPanel

    /** The text of every title bar button, in the order of the bar. */
    private fun buttonTexts(tabs: SessionTabs): List<String?> = tabs.titleActions()
        .map { it to TestActionEvent.createTestEvent(it) }
        .onEach { (action, event) -> action.update(event) }
        .map { (_, event) -> event.presentation.text }

    /**
     * Waits until the work that a start put on other threads ended.
     *
     * The start hands the bridge lookup to a pooled thread, and that thread hands the
     * mount back to the user interface thread. This method pumps that thread, so no work
     * of one test reaches the teardown of the fixture.
     */
    private fun settle() {
        val deadline = System.currentTimeMillis() + SETTLE_MILLIS
        while (label().endsWith("(starting)")) {
            check(System.currentTimeMillis() < deadline) { "the session never left the starting state" }
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            Thread.sleep(STEP_MILLIS)
        }
    }

    /** The Rename button of the title bar, with its presentation already filled. */
    private fun renameButton(tabs: SessionTabs): Pair<AnAction, AnActionEvent> =
        tabs.titleActions()
            .map { it to TestActionEvent.createTestEvent(it) }
            .onEach { (action, event) -> action.update(event) }
            .first { (_, event) -> event.presentation.text == SessionNaming.ACTION_TEXT }

    /** Names the tab through the button, so the test takes the route of the user. */
    private fun rename(tabs: SessionTabs, answer: String) {
        TestDialogManager.setTestInputDialog(TestInputDialog { answer })
        val (action, event) = renameButton(tabs)
        action.actionPerformed(event)
    }

    fun `test a tab carries the short name of its agent`() {
        settings().agent = AgentId.AIDER

        openTabs()

        assertEquals("Aider 1 (not started)", label())
    }

    fun `test a tab of a project with no chosen agent carries the plain stem`() {
        settings().agent = null

        openTabs()

        assertEquals("Session 1 (not started)", label())
    }

    fun `test a change of the agent renames a tab that started no session`() {
        settings().agent = AgentId.AIDER
        openTabs()
        assertEquals("Aider 1 (not started)", label())

        settings().agent = AgentId.CODEX
        project.messageBus.syncPublisher(SESSION_NAMES).namesChanged()

        assertEquals("Codex 1 (not started)", label())
    }

    fun `test the rename is off for an agent that names its own sessions`() {
        settings().agent = AgentId.CLAUDE
        val tabs = openTabs()

        val (_, event) = renameButton(tabs)

        assertFalse(event.presentation.isEnabled)
        assertEquals(
            "Claude Code names its own sessions. Type /rename in the session to name it.",
            event.presentation.description,
        )
    }

    fun `test the rename is on for an agent that names no session`() {
        settings().agent = AgentId.AIDER
        val tabs = openTabs()

        val (_, event) = renameButton(tabs)

        assertTrue(event.presentation.isEnabled)
        assertEquals(SessionNaming.HINT, event.presentation.description)
    }

    fun `test the name that the user typed reaches the tab`() {
        settings().agent = AgentId.AIDER
        val tabs = openTabs()

        rename(tabs, "my notes")

        assertEquals("my notes (not started)", label())
    }

    fun `test an empty answer brings the built name back`() {
        settings().agent = AgentId.AIDER
        val tabs = openTabs()
        rename(tabs, "my notes")

        rename(tabs, "")

        assertEquals("Aider 1 (not started)", label())
    }

    fun `test the name of the agent stands over the name of the user`() {
        settings().agent = AgentId.AIDER
        val tabs = openTabs()
        rename(tabs, "my notes")

        panel().nameFromAgent("fix the parser")

        assertEquals("fix the parser (not started)", label())
    }

    fun `test a long name is cut on the tab and whole in the tooltip`() {
        settings().agent = AgentId.AIDER
        val tabs = openTabs()

        rename(tabs, LONG_NAME)

        assertEquals("rewrite the whole aut... (not started)", label())
        assertEquals("$LONG_NAME (not started)", tooltip())
        assertTrue(label().length < tooltip().length)
    }

    fun `test the title bar carries three buttons in one order`() {
        settings().agent = AgentId.AIDER

        val tabs = openTabs()

        assertEquals(listOf("New Review Session", "Rename Session", "Start Aider"), buttonTexts(tabs))
    }

    fun `test the button of a choice that names no product carries the plain word`() {
        // Another agent is an entry of a menu. "Start Another agent" would read as a
        // request for one more agent, and the plus button is the control that does that.
        settings().agent = AgentId.CUSTOM

        assertEquals(
            listOf("New Review Session", "Rename Session", "Start the session"),
            buttonTexts(openTabs()),
        )
    }

    fun `test a rename that the user cancelled keeps the name of the tab`() {
        settings().agent = AgentId.AIDER
        val tabs = openTabs()
        rename(tabs, "my notes")

        TestDialogManager.setTestInputDialog(TestInputDialog { null })
        val (action, event) = renameButton(tabs)
        action.actionPerformed(event)

        assertEquals("my notes (not started)", label())
    }

    fun `test a new start drops the name that the agent gave`() {
        settings().agent = AgentId.AIDER
        openTabs()
        panel().nameFromAgent("fix the parser")
        assertEquals("fix the parser (not started)", label())

        panel().start()

        assertEquals("Aider 1 (starting)", label())
        settle()
    }

    private companion object {
        const val LONG_NAME = "rewrite the whole authentication layer"
        const val SETTLE_MILLIS = 30000L
        const val STEP_MILLIS = 10L
    }
}
