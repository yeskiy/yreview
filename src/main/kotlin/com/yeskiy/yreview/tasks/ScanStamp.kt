package com.yeskiy.yreview.tasks

import com.intellij.openapi.project.Project
import com.yeskiy.yreview.store.GitDirs
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NoteTips
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRules
import git4idea.repo.GitRepositoryManager
import java.nio.file.Files
import java.nio.file.Path

/** What can change the tasks outside the IDE with no signal to the tab. Each part is a file read or a memory read. */
data class ScanStamp(
    val sure: Boolean,
    val heads: Map<String, String?>,
    val tips: Map<String, Map<String, String>>,
    val folders: Map<String, List<String>>,
    val outside: List<String>,
) {
    fun matches(other: ScanStamp): Boolean = sure && other.sure && this == other

    companion object {

        /** It starts no git. An outside root with no cached answer, or with a cached head that the files do not show, is not sure. */
        fun of(project: Project): ScanStamp {
            val repositories = GitRepositoryManager.getInstance(project).repositories
            val (outside, cached) = TaskScan.cachedOutside(project)
            val outsideGit = outside.filter { it.kind == StoreKind.GIT }
            return build(
                heads = repositories.associate { it.root.path to it.currentRevision } + outsideGit.associate { it.root to it.commit },
                gitRoots = repositories.map { it.root.path } + outsideGit.map { it.root },
                folderRoots = ReviewService.getInstance(project).storeRoots(migrate = false)
                    .filter { it.kind == StoreKind.FOLDER }.map { it.root.path } +
                    outside.filter { it.kind == StoreKind.FOLDER }.map { it.root },
                outside = outside.flatMap { root -> root.files.map { it.path } }.sorted(),
                known = cached && outsideGit.all { GitDirs.head(it.root) == it.commit },
            )
        }

        internal fun build(
            heads: Map<String, String?>,
            gitRoots: List<String>,
            folderRoots: List<String>,
            outside: List<String>,
            known: Boolean = true,
        ): ScanStamp {
            val tips = gitRoots.distinct().associateWith { root -> GitDirs.commonDir(root)?.let { NoteTips.read(it, NoteRefs.ALL) } }
            val folders = folderRoots.distinct().associateWith { filesOf(Path.of(StoreRules.storeFolder(it))) }
            return ScanStamp(
                sure = known && tips.values.none { it == null } && folders.values.none { it == null },
                heads = heads,
                tips = tips.mapValues { it.value.orEmpty() },
                folders = folders.mapValues { it.value.orEmpty() },
                outside = outside,
            )
        }

        /** Each regular file of a folder store with its size and time, sorted. Null when a file changes during the walk. */
        private fun filesOf(folder: Path): List<String>? = runCatching {
            if (!Files.isDirectory(folder)) emptyList()
            else Files.walk(folder).use { files ->
                files.filter { Files.isRegularFile(it) }
                    .map { "${folder.relativize(it)}:${Files.size(it)}:${Files.getLastModifiedTime(it).toMillis()}" }
                    .sorted().toList()
            }
        }.getOrNull()
    }
}
