package com.yeskiy.yreview.toolwindow

import com.intellij.icons.AllIcons
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.todo.TodoConfiguration
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.search.TodoPattern
import com.intellij.ui.SimpleTextAttributes
import com.yeskiy.yreview.tasks.FolderKind
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskFolder
import com.yeskiy.yreview.tasks.TaskGroup
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TaskLabels
import com.yeskiy.yreview.tasks.TaskLayout
import com.yeskiy.yreview.tasks.TaskPath
import com.yeskiy.yreview.tasks.TaskTree
import javax.swing.Icon

/** A row that stands for one task or for a set of them. The check box needs the set. */
interface TaskHolder {

    val tasks: List<ReviewTask>
}

/**
 * The tree of the review tool window.
 *
 * The built-in TODO view is closed. It declares no extension point, and the one method
 * that adds a tab is internal. The panel therefore keeps the shape of that view and feeds
 * the tree itself. Every class here belongs to the open platform.
 */
class TaskStructure(project: Project) : AbstractTreeStructureBase(project) {

    @Volatile
    var layout: TaskLayout = TaskLayout()

    private val root = RootNode(project) { layout }

    override fun getRootElement(): Any = root

    override fun getProviders(): List<TreeStructureProvider> = emptyList()

    override fun commit() = Unit

    override fun hasSomethingToCommit(): Boolean = false

    override fun isToBuildChildrenInBackground(element: Any): Boolean = true
}

class RootNode(project: Project, private val supply: () -> TaskLayout) :
    AbstractTreeNode<String>(project, ROOT_NAME), TaskHolder {

    override val tasks: List<ReviewTask> get() = TaskTree.tasksOf(supply())

    override fun getChildren(): Collection<AbstractTreeNode<*>> = TaskNodes.children(project, supply())

    override fun update(presentation: PresentationData) {
        presentation.presentableText = value
    }

    companion object {
        private const val ROOT_NAME = "Review tasks"
    }
}

class FolderNode(project: Project, folder: TaskFolder) :
    AbstractTreeNode<TaskFolder>(project, folder), TaskHolder {

    override val tasks: List<ReviewTask> get() = TaskTree.tasksOf(value)

    override fun getChildren(): Collection<AbstractTreeNode<*>> =
        TaskNodes.children(project, TaskLayout(value.folders, value.files))

    override fun update(presentation: PresentationData) {
        presentation.setIcon(icon())
        presentation.addText(TaskLabels.folderTitle(value), SimpleTextAttributes.REGULAR_ATTRIBUTES)
        presentation.addText("  ${TaskLabels.folderCount(value)}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }

    private fun icon(): Icon =
        if (value.kind == FolderKind.MODULE) AllIcons.Nodes.Module else AllIcons.Nodes.Folder
}

class FileNode(project: Project, group: TaskGroup) :
    AbstractTreeNode<TaskGroup>(project, group), TaskHolder {

    override val tasks: List<ReviewTask> get() = value.tasks

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

class TaskNode(project: Project, task: ReviewTask) :
    AbstractTreeNode<ReviewTask>(project, task), TaskHolder {

    override val tasks: List<ReviewTask> get() = listOf(value)

    override fun getChildren(): Collection<AbstractTreeNode<*>> = emptyList()

    override fun isAlwaysLeaf(): Boolean = true

    override fun update(presentation: PresentationData) {
        presentation.setIcon(TaskNodes.icon(value))
        presentation.addText(TaskLabels.taskTitle(value), TaskNodes.attributes(value))
        val state = TaskLabels.taskState(value)
        if (state.isNotEmpty()) presentation.addText("  [$state]", SimpleTextAttributes.GRAYED_ATTRIBUTES)
        presentation.tooltip = TaskLabels.taskTooltip(value)
    }

    override fun canNavigate(): Boolean = descriptor() != null

    override fun canNavigateToSource(): Boolean = canNavigate()

    override fun navigate(requestFocus: Boolean) {
        descriptor()?.navigate(requestFocus)
    }

    private fun descriptor(): OpenFileDescriptor? = TaskNodes.descriptor(project, value)
}

object TaskNodes {

    private val COMMENT_ICON = IconLoader.getIcon("/icons/comment.svg", TaskNodes::class.java)

    fun children(project: Project, layout: TaskLayout): List<AbstractTreeNode<*>> =
        layout.folders.map { FolderNode(project, it) } + layout.files.map { FileNode(project, it) }

    /**
     * The file of one task, while that file stands under the root of its repository.
     *
     * The file system of the IDE follows a step of two dots. A note record of another
     * person could therefore open a file of the machine, so [TaskPath] settles that first.
     */
    fun find(task: ReviewTask): VirtualFile? {
        if (task.filePath.isEmpty()) return null
        if (!TaskPath.isUnder(task.rootPath, task.filePath)) return null
        return LocalFileSystem.getInstance().findFileByPath(task.filePath)
    }

    fun descriptor(project: Project, task: ReviewTask): OpenFileDescriptor? {
        val file = find(task) ?: return null
        return OpenFileDescriptor(project, file, (task.startLine - 1).coerceAtLeast(0), 0)
    }

    /** The icon the user configured for the pattern, so a FIXME looks like a FIXME. */
    fun icon(task: ReviewTask): Icon = when {
        task.kind != TaskKind.TODO -> COMMENT_ICON
        else -> pattern(task)?.attributes?.icon ?: AllIcons.General.TodoDefault
    }

    /** The color the user configured for the pattern. A comment keeps the plain color. */
    fun attributes(task: ReviewTask): SimpleTextAttributes {
        if (task.kind != TaskKind.TODO) return SimpleTextAttributes.REGULAR_ATTRIBUTES
        val text = pattern(task)?.attributes?.customizedTextAttributes
            ?: return SimpleTextAttributes.REGULAR_ATTRIBUTES
        return SimpleTextAttributes.fromTextAttributes(text)
    }

    private fun pattern(task: ReviewTask): TodoPattern? {
        if (task.patternRule.isEmpty()) return null
        return TodoConfiguration.getInstance().todoPatterns.firstOrNull { it.patternString == task.patternRule }
    }
}
