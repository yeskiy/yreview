package com.yeskiy.yreview.tasks

/** Gives the TODO items of one file their identifiers. The line is not part of an identifier. */
object TodoIds {

    /**
     * The repository part of an identifier. A root inside the project gives its path from
     * the project folder, so two machines give the same value. Other roots give the full path.
     */
    fun repositoryOf(basePath: String?, rootPath: String): String = when {
        basePath.isNullOrEmpty() -> rootPath
        rootPath == basePath -> ""
        rootPath.startsWith("$basePath/") -> rootPath.substring(basePath.length + 1)
        else -> rootPath
    }

    /** The same items with their identifiers. The items come from one file, in source order. */
    fun assign(repository: String, items: List<ReviewTask>): List<ReviewTask> {
        val texts = items.map { TaskIds.normalTodoText(it.text) }
        return items.mapIndexed { index, item ->
            item.copy(id = TaskIds.forTodo(repository, item.path, item.text, texts.take(index).count { it == texts[index] }))
        }
    }
}

/**
 * Moves the TODO identifiers of an older build, which hold the path digest and the line.
 * A task file holds such values until the next send, and an agent can still report them.
 */
object TodoMigration {

    /** The version of a task file that holds current TODO identifiers. It marks a migrated file. */
    const val VERSION = 2

    /**
     * The task file with each older TODO identifier replaced by the identifier of the open
     * item that sits at the same path and line. An entry with no such item stays as it is.
     */
    fun migrate(document: TaskDocument, open: List<ReviewTask>): TaskDocument {
        if (document.version >= VERSION) return document
        val here = open.filter { it.kind == TaskKind.TODO && it.rootPath == document.repository }
        return document.copy(version = VERSION, tasks = document.tasks.map { moved(it, here) ?: it })
    }

    /** What a value of an older build names among the open TODO items, by path digest and line. */
    fun legacyMatch(key: HandleKey, open: List<ReviewTask>): HandleMatch =
        TaskHandles.match(key, open.filter { it.kind == TaskKind.TODO }.map { TaskIds.legacyTodo(it.path, it.startLine) })

    private fun moved(entry: ReviewTask, open: List<ReviewTask>): ReviewTask? {
        if (entry.kind != TaskKind.TODO) return null
        if (TaskHandles.of(entry.id) != TaskHandles.of(TaskIds.legacyTodo(entry.path, entry.startLine))) return null
        val atLine = open.filter { it.path == entry.path && it.startLine == entry.startLine }
        val hit = atLine.singleOrNull()
            ?: atLine.singleOrNull { TaskIds.normalTodoText(it.text) == TaskIds.normalTodoText(entry.text) }
            ?: return null
        return entry.copy(id = if (TaskIds.isHandle(entry.id)) TaskHandles.of(hit.id) else hit.id)
    }
}
