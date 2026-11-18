package com.yeskiy.yreview.tasks

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.PsiFileSystemItem
import com.intellij.psi.PsiTreeChangeEvent
import git4idea.repo.GitRepositoryManager

/**
 * The signals of the source files that ask the review tree to read its scope again.
 *
 * The platform sends a signal for every change of a file, and it sends two more that name
 * no file at all. The bundled TODO view drops those two, and this object drops them too.
 */
object SourceSignal {

    /**
     * True when a property signal asks for a new read of the scope.
     *
     * A read loads the file of every task, and the platform drops those files again when it
     * needs the memory. The platform reports that drop as [PsiTreeChangeEvent.PROP_UNLOADED_PSI],
     * so a tab that reads the scope for that property starts its own next read. The property
     * [PsiTreeChangeEvent.PROP_FILE_TYPES] arrives a second time through the file type
     * listener of the tab, so the tab reads the scope once and not twice.
     */
    fun readAgain(property: String?): Boolean = property in WATCHED

    /**
     * True when [item] is a real file or folder on disk that a store of the tab can show.
     * An editor text field, such as the comment card, edits an in-memory file that no task comes from.
     */
    fun watched(project: Project, item: PsiFileSystemItem?): Boolean {
        val file = item?.takeIf { it.isPhysical }?.virtualFile?.takeIf { it.isInLocalFileSystem } ?: return false
        return ProjectFileIndex.getInstance(project).isInContent(file) ||
            project.guessProjectDir()?.let { VfsUtilCore.isAncestor(it, file, false) } == true ||
            GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file) != null ||
            !file.isDirectory && FileEditorManager.getInstance(project).isFileOpen(file)
    }

    private val WATCHED = setOf(
        PsiTreeChangeEvent.PROP_ROOTS,
        PsiTreeChangeEvent.PROP_WRITABLE,
        PsiTreeChangeEvent.PROP_FILE_NAME,
        PsiTreeChangeEvent.PROP_DIRECTORY_NAME,
    )
}
