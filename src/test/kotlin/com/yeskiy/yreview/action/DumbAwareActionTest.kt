package com.yeskiy.yreview.action

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.toolWindow.ToolWindowHeadlessManagerImpl
import com.yeskiy.yreview.bridge.BridgeService
import com.yeskiy.yreview.diagnostic.CopyDiagnosticsAction
import com.yeskiy.yreview.diff.AddDiffCommentAction
import com.yeskiy.yreview.gutter.CommentIconRenderer
import com.yeskiy.yreview.session.SessionTabs
import com.yeskiy.yreview.tasks.TaskScope
import com.yeskiy.yreview.toolwindow.ReviewTreePanel
import java.io.File
import java.lang.reflect.Modifier
import java.net.URI
import java.util.jar.JarFile

/**
 * Every action of the plugin runs while the IDE builds the index.
 *
 * The platform disables an action that answers false to isDumbAware. A title action of a
 * tool window stays on screen in that state, so the user reads a grey button and no reason.
 * These tests ask the platform the same question for each action of the plugin.
 *
 * The last test walks the compiled classes of the plugin. An action that a later change
 * adds therefore reaches this test without an edit here.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class DumbAwareActionTest : BasePlatformTestCase() {

    private lateinit var window: ToolWindow

    override fun setUp() {
        super.setUp()
        window = ToolWindowHeadlessManagerImpl.MockToolWindow(project)
    }

    override fun tearDown() {
        try {
            BridgeService.getInstance(project).stop()
        } finally {
            super.tearDown()
        }
    }

    fun `test the editor action runs while the index builds`() =
        assertAllRun(listOf(AddCommentAction()))

    fun `test the diff action runs while the index builds`() =
        assertAllRun(listOf(AddDiffCommentAction()))

    fun `test the diagnostic action runs while the index builds`() =
        assertAllRun(listOf(CopyDiagnosticsAction()))

    /**
     * The platform wraps a registered intention, and the wrapper hands the question to the
     * class of the plugin. This test asks the class itself, as the wrapper does.
     */
    fun `test the intention runs while the index builds`() {
        val intention: IntentionAction = AddCommentIntention()

        assertTrue(
            "${intention.javaClass.name} does not run while the IDE builds the index.",
            intention.isDumbAware,
        )
    }

    fun `test the gutter icon opens its card while the index builds`() {
        val file = myFixture.configureByText("a.txt", "").virtualFile

        assertAllRun(listOf(CommentIconRenderer(project, file, emptyList()).clickAction))
    }

    fun `test every title action of the session window runs while the index builds`() {
        val tabs = SessionTabs(project, window)
        Disposer.register(testRootDisposable, tabs)

        val actions = tabs.titleActions()

        assertEquals(3, actions.size)
        assertAllRun(actions)
    }

    fun `test every toolbar action of the review window runs while the index builds`() {
        val actions = ownActions(reviewToolbarGroup())

        assertEquals(TOOLBAR_ACTIONS, actions.map { it.javaClass.simpleName }.distinct().size)
        assertAllRun(actions)
    }

    /**
     * The guard for every action a later change adds.
     *
     * The scan reads the compiled classes of the plugin, so it finds an action in a file
     * that this test never names.
     */
    fun `test every action class of the plugin carries the marker`() {
        val classes = compiledActionClasses()

        assertTrue("The scan found no action class of the plugin.", classes.size >= PLUGIN_ACTIONS)
        val without = classes.filterNot { DumbAware::class.java.isAssignableFrom(it) }.map { it.name }
        assertEquals(
            "These action classes do not implement DumbAware, so the platform disables them " +
                "while the IDE builds the index: ${without.sorted()}",
            emptyList<String>(),
            without.sorted(),
        )
    }

    /** Names every action that answers false, so one run reports the whole set. */
    private fun assertAllRun(actions: List<AnAction>) {
        val blocked = actions.filterNot { it.isDumbAware }.map { it.javaClass.name }.distinct().sorted()
        assertEquals(
            "These actions do not run while the IDE builds the index: $blocked",
            emptyList<String>(),
            blocked,
        )
    }

    /** The group the review window really builds, read from the panel of the project tab. */
    private fun reviewToolbarGroup(): ActionGroup {
        val panel = ReviewTreePanel(project, TaskScope.PROJECT)
        Disposer.register(testRootDisposable, panel)
        val field = ReviewTreePanel::class.java.getDeclaredField("toolbar")
        field.isAccessible = true
        return (field.get(panel) as ActionToolbar).actionGroup
    }

    /**
     * Every action of the plugin inside [group], and every action of a group of the plugin
     * under it. A group of the platform keeps its own children, so the walk stops there.
     */
    private fun ownActions(group: ActionGroup): List<AnAction> =
        group.getChildren(null).filter { it.javaClass.name.startsWith(PACKAGE) }.flatMap {
            if (it is ActionGroup) listOf(it) + ownActions(it) else listOf(it)
        }

    /** Every class of the plugin that the platform treats as an action. */
    private fun compiledActionClasses(): List<Class<*>> {
        val loader = javaClass.classLoader
        val marker = "$FOLDER/action/AddCommentAction.class"
        val root = (loader.getResource(marker) ?: fail("The test classpath holds no $marker.")).toString()
            .removeSuffix(marker)
        return if (root.startsWith(JAR)) {
            namesInJar(File(URI(root.removePrefix(JAR).removeSuffix("!/"))))
        } else {
            namesInFolder(File(URI(root)))
        }.map { Class.forName(it, false, loader) }.filter { isAction(it) }
    }

    private fun namesInFolder(root: File): List<String> =
        root.resolve(FOLDER).walkTopDown()
            .filter { it.isFile && it.extension == "class" }
            .map { it.relativeTo(root).path.removeSuffix(".class").replace(File.separatorChar, '.') }
            .toList()

    private fun namesInJar(jar: File): List<String> = JarFile(jar).use { open ->
        open.entries().asSequence()
            .map { it.name }
            .filter { it.startsWith("$FOLDER/") && it.endsWith(".class") }
            .map { it.removeSuffix(".class").replace('/', '.') }
            .toList()
    }

    private fun isAction(candidate: Class<*>): Boolean {
        if (candidate.isInterface || candidate.isSynthetic) return false
        if (Modifier.isAbstract(candidate.modifiers)) return false
        return AnAction::class.java.isAssignableFrom(candidate) ||
            IntentionAction::class.java.isAssignableFrom(candidate)
    }

    private companion object {
        const val PACKAGE = "com.yeskiy.yreview"
        const val FOLDER = "com/yeskiy/yreview"
        const val JAR = "jar:"

        /** The kinds of action the toolbar of the review window builds. */
        const val TOOLBAR_ACTIONS = 16

        /** The smallest number of action classes the plugin holds. */
        const val PLUGIN_ACTIONS = 23
    }
}
