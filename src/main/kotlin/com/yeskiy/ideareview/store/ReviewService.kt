package com.yeskiy.ideareview.store

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import git4idea.repo.GitRepositoryManager

@Service(Service.Level.PROJECT)
class ReviewService(private val project: Project) {

    fun bookForRoot(root: VirtualFile): CommentBook {
        val runner = ideGitRunner(project, root)
        return CommentBook(NotesGateway(runner), author = authorOf(runner))
    }

    fun bookFor(file: VirtualFile): CommentBook? = repositoryRoot(file)?.let { bookForRoot(it) }

    fun headOf(file: VirtualFile): String? =
        GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)?.currentRevision

    fun relativePath(file: VirtualFile): String? {
        val root = repositoryRoot(file)?.path ?: return null
        if (!file.path.startsWith("$root/")) return null
        return file.path.removePrefix("$root/")
    }

    fun repositoryRoot(file: VirtualFile): VirtualFile? =
        GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file)?.root

    private fun authorOf(runner: GitRunner): String =
        runner.run("config", "user.email").stdout.trim().ifEmpty { "unknown" }

    companion object {
        fun getInstance(project: Project): ReviewService = project.service()
    }
}
