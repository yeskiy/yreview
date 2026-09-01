package com.yeskiy.yreview.action

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The rule that names the place of the write box.
 *
 * The names here stand for the layout values of a split editor. The rule holds no type of
 * the IDE, so these tests read it without a running IDE. The same trick carries
 * [EditorPickTest].
 */
class CommentPlaceTest {

    private val previewOnly = "the preview alone"

    @Test
    fun `a tab that shows the preview alone takes the floating box`() {
        assertEquals(BoxPlace.PREVIEW, CommentPlace.placeOf(previewOnly, previewOnly))
    }

    @Test
    fun `a tab that shows both sides keeps the box in the editor`() {
        assertEquals(BoxPlace.EDITOR, CommentPlace.placeOf("both sides", previewOnly))
    }

    @Test
    fun `a tab that shows the editor alone keeps the box in the editor`() {
        assertEquals(BoxPlace.EDITOR, CommentPlace.placeOf("the editor alone", previewOnly))
    }

    @Test
    fun `a tab that is no split editor keeps the box in the editor`() {
        assertEquals(BoxPlace.EDITOR, CommentPlace.placeOf(null, previewOnly))
    }

    /**
     * A comment must never move the tab of the user. The plugin changed the layout before,
     * and the user lost the reading view on every comment.
     */
    @Test
    fun `no source file changes the layout of a split editor`() {
        val callers = File("src/main/kotlin/com/yeskiy/yreview")
            .walkTopDown()
            .filter { it.extension == "kt" }
            .filter { changesTheLayout(it.readText()) }
            .map { it.name }
            .toList()
        assertTrue(callers.isEmpty(), "a comment must not move the tab of the user: $callers")
    }

    private fun changesTheLayout(source: String): Boolean =
        source.contains("TextEditorWithPreview") && source.contains("setLayout(")
}
