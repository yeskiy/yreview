package com.yeskiy.yreview.tasks

import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.AnchorRules
import com.yeskiy.yreview.store.ReviewAnchor
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRules

/** One store root outside the project, and its files that are open in the editor. */
data class OutsideRoot(
    val root: String,
    val kind: StoreKind,
    val commit: String,
    val label: String,
    val files: List<VirtualFile>,
)

/** The Kotlin twin of `tabRoots.ts`: the open files outside every root of the project, grouped by store root. */
object OutsideRoots {

    /** [anchorOf] can start git, so the caller runs this off the user interface thread. */
    fun of(
        open: List<VirtualFile>,
        inside: List<String>,
        anchorOf: (VirtualFile) -> AnchorResult,
        home: String?,
    ): List<OutsideRoot> =
        open.distinct()
            .filter { it.isInLocalFileSystem && !isInside(it.path, inside) }
            .mapNotNull { file -> (anchorOf(file) as? AnchorResult.Found)?.anchor?.let { file to it } }
            .filterNot { (_, anchor) -> isInside(anchor.root.path, inside) }
            .groupBy({ (_, anchor) -> StoreKey(anchor) }, { (file, _) -> file })
            .map { (key, files) -> OutsideRoot(key.root, key.kind, key.commit, StoreRules.label(key.root, home), files) }
            .sortedBy { it.root }

    private fun isInside(path: String, inside: List<String>): Boolean =
        inside.any { it == path || AnchorRules.holds(it, path) }

    private data class StoreKey(val root: String, val kind: StoreKind, val commit: String) {
        constructor(anchor: ReviewAnchor) : this(anchor.root.path, anchor.kind, anchor.key)
    }
}

/** One TODO rule: the rule text the user wrote, and the expression that runs it. */
data class TodoRule(val rule: String, val regex: Regex)

/** One TODO item of a text. The line is one-based, the column zero-based. */
data class TodoLine(val line: Int, val column: Int, val text: String, val rule: String)

/**
 * The TODO items of a text, with the rule of `todoScan.ts` in VS Code. The platform index has
 * no items for a file outside the project, so the scan of such a file reads its text.
 */
object TodoLines {

    private val LINE_BREAK = Regex("\r\n|\r|\n")
    private val CLOSER = Regex("""\*/|-->|\*\)|#\}|%\}|-\}""")
    private val CLOSER_AT_END = Regex("""(?:\*/|-->|\*\)|#\}|%\}|-\})$""")

    fun of(text: String, rules: List<TodoRule>): List<TodoLine> =
        text.split(LINE_BREAK).flatMapIndexed { index, content -> ofLine(content, index + 1, rules) }

    /** A part of a line ends after a comment closer. A match that starts inside an earlier match is dropped. */
    private fun ofLine(content: String, line: Int, rules: List<TodoRule>): List<TodoLine> =
        (listOf(0) + CLOSER.findAll(content).map { it.range.last + 1 } + content.length)
            .zipWithNext()
            .filter { (start, end) -> end > start }
            .flatMap { (start, end) -> rules.flatMap { rule -> hits(content.substring(start, end), start, line, rule) } }
            .sortedBy { it.first.column }
            .fold(emptyList<Pair<TodoLine, Int>>()) { kept, hit ->
                if (kept.isNotEmpty() && hit.first.column < kept.last().second) kept else kept + hit
            }
            .map { it.first }

    /** Each hit with the column after its match. */
    private fun hits(part: String, start: Int, line: Int, rule: TodoRule): List<Pair<TodoLine, Int>> =
        rule.regex.findAll(part).mapNotNull { match ->
            val text = match.value.trim().replace(CLOSER_AT_END, "").trim()
            val column = start + match.range.first
            if (text.isEmpty()) null else TodoLine(line, column, text, rule.rule) to column + match.value.length
        }.toList()
}
