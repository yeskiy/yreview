package com.yeskiy.yreview.session

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.openapi.ui.TestInputDialog
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.toolWindow.ToolWindowHeadlessManagerImpl
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

    private fun panel(): ClaudeSessionPanel =
        window.contentManager.getContent(0)!!.component as ClaudeSessionPanel

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
}
