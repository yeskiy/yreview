package com.yeskiy.yreview.gutter

import com.intellij.openapi.editor.EditorKind
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener

/**
 * Paints the comment icons of a file as soon as the platform opens an editor for it.
 *
 * A diff editor attaches through [com.yeskiy.yreview.diff.ReviewDiffExtension] instead,
 * because a diff side draws the comments of its own revision. That revision reaches the
 * editor after the platform creates it, so an attach here would read an empty side.
 *
 * The release path takes every editor, so a diff editor also leaves no entry behind.
 */
class CommentGutterListener : EditorFactoryListener {

    override fun editorCreated(event: EditorFactoryEvent) {
        if (event.editor.editorKind != EditorKind.MAIN_EDITOR) return
        gutterOf(event)?.attach(event.editor)
    }

    override fun editorReleased(event: EditorFactoryEvent) {
        gutterOf(event)?.detach(event.editor)
    }

    private fun gutterOf(event: EditorFactoryEvent): CommentGutter? {
        val project = event.editor.project ?: return null
        if (project.isDisposed) return null
        return CommentGutter.getInstance(project)
    }
}
