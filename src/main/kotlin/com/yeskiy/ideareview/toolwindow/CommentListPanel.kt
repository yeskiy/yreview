package com.yeskiy.ideareview.toolwindow

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.yeskiy.ideareview.store.NoteRefs
import com.yeskiy.ideareview.store.ReviewService
import com.yeskiy.ideareview.store.StoredComment
import java.awt.BorderLayout
import javax.swing.DefaultListModel
import javax.swing.JPanel

class CommentListPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val model = DefaultListModel<String>()
    private val rows = mutableListOf<StoredComment>()

    init {
        add(JBScrollPane(JBList(model)), BorderLayout.CENTER)
        reload()
    }

    fun reload() {
        model.clear()
        rows.clear()

        val file = FileEditorManager.getInstance(project).selectedFiles.firstOrNull() ?: return
        val service = ReviewService.getInstance(project)
        val commit = service.headOf(file) ?: return
        val book = service.bookFor(file) ?: return

        book.open(commit, NoteRefs.ALL).forEach { stored ->
            rows.add(stored)
            val location = stored.comment.location
            val shared = if (NoteRefs.isShared(stored.ref)) "shared" else "local"
            val head = stored.comment.description?.lineSequence()?.firstOrNull().orEmpty()
            model.addElement(
                "${location?.path}:${location?.range?.startLine}-${location?.range?.endLine}  [$shared]  $head"
            )
        }
    }
}
