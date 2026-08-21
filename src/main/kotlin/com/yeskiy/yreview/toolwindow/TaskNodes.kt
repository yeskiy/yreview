package com.yeskiy.yreview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.SimpleTextAttributes
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskGroup
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TaskLabels
import javax.swing.Icon

/**
 * The tree of the review tool window.
 *
 * The built-in TODO view is closed. It declares no extension point, and the one method
 * that adds a tab is internal. The panel therefore keeps the shape of that view and feeds
 * the tree itself. Every class here belongs to the open platform.
 */
class TaskStructure(project: Project) : AbstractTreeStructureBase(project) {

    @Volatile
    var groups: List<TaskGroup> = emptyList()

    private val root = RootNode(project) { groups }

    override fun getRootElement(): Any = root

    override fun getProviders(): List<TreeStructureProvider> = emptyList()

    override fun commit() = Unit

    override fun hasSomethingToCommit(): Boolean = false

    override fun isToBuildChildrenInBackground(element: Any): Boolean = true
}

class RootNode(project: Project, private val supply: () -> List<TaskGroup>) :
    AbstractTreeNode<String>(project, ROOT_NAME) {

    override fun getChildren(): Collection<AbstractTreeNode<*>> = supply().map { FileNode(project, it) }

    override fun update(presentation: PresentationData) {
        presentation.presentableText = value
    }

    companion object {
        private const val ROOT_NAME = "Review tasks"
    }
}

class FileNode(project: Project, group: TaskGroup) : AbstractTreeNode<TaskGroup>(project, group) {

    override fun getChildren(): Collection<AbstractTreeNode<*>> = value.tasks.map { TaskNode(project, it) }

    override fun update(presentation: PresentationData) {
        presentation.setIcon(fileIcon())
        presentation.addText(TaskLabels.fileTitle(value), SimpleTextAttributes.REGULAR_ATTRIBUTES)
        presentation.addText("  ${TaskLabels.fileCount(value)}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }

    override fun canNavigate(): Boolean = file() != null

    override fun canNavigateToSource(): Boolean = canNavigate()

    override fun navigate(requestFocus: Boolean) {
        file()?.let { OpenFileDescriptor(project, it).navigate(requestFocus) }
    }

    private fun file(): VirtualFile? = value.tasks.firstNotNullOfOrNull { TaskNodes.find(it) }

    private fun fileIcon(): Icon = file()?.fileType?.icon ?: AllIcons.FileTypes.Any_type
}

class TaskNode(project: Project, task: ReviewTask) : AbstractTreeNode<ReviewTask>(project, task) {

    override fun getChildren(): Collection<AbstractTreeNode<*>> = emptyList()

    override fun isAlwaysLeaf(): Boolean = true

    override fun update(presentation: PresentationData) {
        presentation.setIcon(TaskNodes.icon(value))
        presentation.addText(TaskLabels.taskTitle(value), SimpleTextAttributes.REGULAR_ATTRIBUTES)
        val state = TaskLabels.taskState(value)
        if (state.isNotEmpty()) presentation.addText("  [$state]", SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }

    override fun canNavigate(): Boolean = descriptor() != null

    override fun canNavigateToSource(): Boolean = canNavigate()

    override fun navigate(requestFocus: Boolean) {
        descriptor()?.navigate(requestFocus)
    }

    private fun descriptor(): OpenFileDescriptor? {
        val file = TaskNodes.find(value) ?: return null
        return OpenFileDescriptor(project, file, (value.startLine - 1).coerceAtLeast(0), 0)
    }
}

object TaskNodes {

    private val COMMENT_ICON = IconLoader.getIcon("/icons/comment.svg", TaskNodes::class.java)

    fun find(task: ReviewTask): VirtualFile? =
        if (task.filePath.isEmpty()) null else LocalFileSystem.getInstance().findFileByPath(task.filePath)

    fun icon(task: ReviewTask): Icon =
        if (task.kind == TaskKind.TODO) AllIcons.General.TodoDefault else COMMENT_ICON
}
