package com.yeskiy.yreview.store

import java.io.File

/** Finds the folder stores inside the work tree of one repository with two git processes. */
object StoreSearch {

    private const val MARK = "${FolderStore.FOLDER}/${FolderStore.NOTES}/"

    private val SKIPPED = setOf("node_modules", ".git")

    /** Every untracked store root inside the work tree of [root], nested repositories and ignored folders left out. */
    fun childStores(runner: GitRunner, root: String): List<String>? {
        val open = runner.run("ls-files", "-z", "--others", "--exclude-standard", "--", ":(glob)**/$MARK**")
            .takeIf { it.ok } ?: return null
        val ignored = runner.run("ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory")
            .takeIf { it.ok } ?: return null
        val fromOpen = entries(open).mapNotNull { path ->
            path.indexOf(MARK).takeIf { it == 0 || it > 0 && path[it - 1] == '/' }?.let { path.substring(0, it).trimEnd('/') }
        }
        // A rule that ignores ".y-review/" is common, so an ignored store folder still counts.
        val fromIgnored = entries(ignored).map { it.trimEnd('/') }
            .filter { it == FolderStore.FOLDER || it.endsWith("/${FolderStore.FOLDER}") }
            .filter { File(StoreRules.join(StoreRules.join(root, it), FolderStore.NOTES)).isDirectory }
            .map { it.removeSuffix(FolderStore.FOLDER).trimEnd('/') }
        return (fromOpen + fromIgnored)
            .filter { relative -> relative.split('/').none { it in SKIPPED } }
            .map { if (it.isEmpty()) root else StoreRules.join(root, it) }
            .distinct()
            .sorted()
    }

    private fun entries(result: GitResult): List<String> = result.stdout.split('\u0000').filter { it.isNotEmpty() }
}
