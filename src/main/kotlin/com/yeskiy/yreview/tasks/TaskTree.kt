package com.yeskiy.yreview.tasks

/** The tasks of one file, in line order. The name is the text the row shows. */
data class TaskGroup(val path: String, val tasks: List<ReviewTask>, val name: String = path)

/** What a folder row stands for. */
enum class FolderKind { MODULE, DIRECTORY }

/** One folder row, with the folders and the files under it. */
data class TaskFolder(
    val name: String,
    val kind: FolderKind,
    val folders: List<TaskFolder> = emptyList(),
    val files: List<TaskGroup> = emptyList(),
)

/** The rows under one parent. The hidden root of the tree is one of these. */
data class TaskLayout(
    val folders: List<TaskFolder> = emptyList(),
    val files: List<TaskGroup> = emptyList(),
) {

    /** How many rows stand under this parent. A layout of no row leaves the tree empty. */
    val rows: Int get() = folders.size + files.size
}

/** The three group toggles of the toolbar. The flatten toggle works with byDirectory only. */
data class TaskGrouping(
    val byModule: Boolean = false,
    val byDirectory: Boolean = false,
    val flatten: Boolean = false,
)

/**
 * Builds the rows of the review tree.
 *
 * [group] puts the tasks of one file together, the way the built-in TODO view does. The
 * label of a group comes from the caller. A project with one repository shows the path
 * inside that repository. A project with several repositories shows the repository name in
 * front of the path.
 *
 * [layout] puts module rows and directory rows above the files, as the group toggles ask.
 */
object TaskTree {

    fun group(tasks: List<ReviewTask>, label: (ReviewTask) -> String = { it.path }): List<TaskGroup> =
        tasks.distinctBy { "${it.filePath} ${it.id}" }
            .groupBy(label)
            .toSortedMap()
            .map { (path, found) -> TaskGroup(path, found.sortedWith(ORDER)) }

    fun layout(groups: List<TaskGroup>, grouping: TaskGrouping): TaskLayout {
        if (!grouping.byModule) return directories(groups, grouping)
        val (known, unknown) = groups.partition { moduleOf(it).isNotEmpty() }
        val outside = directories(unknown, grouping)
        return TaskLayout(
            known.groupBy { moduleOf(it) }
                .toSortedMap()
                .map { (name, inside) -> folder(name, FolderKind.MODULE, directories(inside, grouping)) } +
                outside.folders,
            outside.files,
        )
    }

    fun flatten(groups: List<TaskGroup>): List<ReviewTask> = groups.flatMap { it.tasks }

    fun tasksOf(folder: TaskFolder): List<ReviewTask> =
        folder.folders.flatMap { tasksOf(it) } + flatten(folder.files)

    fun tasksOf(layout: TaskLayout): List<ReviewTask> =
        layout.folders.flatMap { tasksOf(it) } + flatten(layout.files)

    private fun directories(groups: List<TaskGroup>, grouping: TaskGrouping): TaskLayout = when {
        !grouping.byDirectory -> TaskLayout(files = groups.sortedBy { it.path })
        grouping.flatten -> flat(groups)
        else -> nest(groups, 0)
    }

    private fun flat(groups: List<TaskGroup>): TaskLayout {
        val (deeper, here) = groups.partition { it.path.contains('/') }
        return TaskLayout(
            deeper.groupBy { it.path.substringBeforeLast('/') }
                .toSortedMap()
                .map { (name, inside) -> TaskFolder(name, FolderKind.DIRECTORY, files = short(inside)) },
            here.sortedBy { it.path },
        )
    }

    private fun nest(groups: List<TaskGroup>, depth: Int): TaskLayout {
        val (deeper, here) = groups.partition { segments(it).size > depth + 1 }
        return TaskLayout(
            deeper.groupBy { segments(it)[depth] }
                .toSortedMap()
                .map { (name, inside) -> folder(name, FolderKind.DIRECTORY, nest(inside, depth + 1)) },
            short(here),
        )
    }

    private fun short(groups: List<TaskGroup>): List<TaskGroup> =
        groups.sortedBy { it.path }.map { it.copy(name = it.path.substringAfterLast('/')) }

    private fun folder(name: String, kind: FolderKind, inside: TaskLayout): TaskFolder =
        TaskFolder(name, kind, inside.folders, inside.files)

    private fun segments(group: TaskGroup): List<String> = group.path.split('/')

    private fun moduleOf(group: TaskGroup): String = group.tasks.firstOrNull()?.module.orEmpty()

    private val ORDER = compareBy<ReviewTask>({ it.startLine }, { it.endLine }, { it.id })
}
