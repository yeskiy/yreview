package com.yeskiy.yreview.tasks

/** A stable text form of a scan result. A commit id becomes its index in [commits], and each key of [names] becomes its value. */
object ScanDump {

    private val OBJECT_ID = Regex("[0-9a-f]{40}")

    fun of(found: List<RepositoryTasks>, commits: List<String>, names: Map<String, String> = emptyMap()): String {
        val id = { text: String -> OBJECT_ID.replace(text) { "C" + commits.indexOf(it.value) } }
        val clean = { value: Any? -> names.entries.fold(value.toString()) { text, (from, to) -> text.replace(from, to) } }
        return found.joinToString("\n") { entry ->
            val head = "entry ${entry.root.name} outside=${clean(entry.outside)} commit=${id(entry.commit)} tasks=${entry.tasks.size}"
            val rows = entry.tasks.sortedWith(compareBy({ it.path }, { it.startLine }, { it.kind }, { it.text })).map { task ->
                listOf(
                    task.kind, task.path, task.startLine, task.startColumn, task.endLine, task.endColumn, task.text,
                    task.pattern, task.author, task.state, task.module, task.patternRule,
                    task.carry?.kind, task.carry?.commit?.let(id), task.carry?.was, task.outside,
                ).joinToString(" | ", transform = clean)
            }
            (listOf(head) + rows).joinToString("\n")
        }
    }
}
