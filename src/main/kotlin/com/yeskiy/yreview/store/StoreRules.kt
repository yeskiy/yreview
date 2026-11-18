package com.yeskiy.yreview.store

import java.nio.file.Path

/** The parts of the store rule that read only path strings. All paths are real paths with "/". */
object StoreRules {

    private val DRIVE_ROOT = Regex("^[A-Za-z]:/$")

    private val SHARE_ROOT = Regex("^//[^/]+/[^/]+/?$")

    fun parentOf(path: String): String? {
        if (isRoot(path)) return null
        val cut = path.trimEnd('/').lastIndexOf('/')
        if (cut < 0) return null
        val head = path.substring(0, cut)
        return when {
            head.isEmpty() -> "/"
            head.length == 2 && head[1] == ':' -> "$head/"
            else -> head
        }
    }

    /** True for "/", "C:/" and "//host/share". */
    fun isRoot(path: String): Boolean = path == "/" || DRIVE_ROOT.matches(path) || SHARE_ROOT.matches(path)

    /** The folders that the walk checks, nearest first. The first ceiling that the walk reaches stops it. */
    fun walk(dir: String, workspaceRoot: String?, home: String?): List<String> =
        generateSequence(dir) { current ->
            if (current == workspaceRoot) null else parentOf(current)?.takeUnless { it == home }
        }.takeWhile { it != home }.toList()

    /** True for a file directly in home or in the bridge folder of home. Such a file gets no store. */
    fun isHomeFile(filePath: String, home: String?): Boolean =
        home != null && (parentOf(filePath) == home || AnchorRules.holds(join(home, FolderStore.FOLDER), filePath))

    fun storeFolder(dir: String): String = join(join(dir, FolderStore.FOLDER), FolderStore.NOTES)

    fun join(dir: String, name: String): String = if (dir.endsWith("/")) "$dir$name" else "$dir/$name"

    fun label(root: String, home: String?): String {
        val short = when {
            home == null -> root
            root == home -> "~"
            AnchorRules.holds(home, root) -> "~/" + AnchorRules.relative(root, home)
            else -> root
        }
        val name = root.trimEnd('/').substringAfterLast('/')
        return if (root == home || name.isEmpty() || name.endsWith(":")) short else "$name ($short)"
    }

    fun homeOf(raw: String?): String? = raw?.takeIf { it.isNotBlank() }?.let { value ->
        runCatching { Path.of(value).toRealPath().toString() }.getOrDefault(value).replace('\\', '/')
    }
}
