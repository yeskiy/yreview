package com.yeskiy.yreview.store

import com.yeskiy.yreview.tasks.TaskPath
import java.nio.file.Files
import java.nio.file.Path

/** The value of `location.text` (spec section 17.4), and null when the writer leaves the field out. */
object LineText {

    const val MAX_LINES = 100

    const val MAX_UNITS = 4000

    /** Java matches a valid pair as one code point, so this matches only a lone surrogate. */
    private val LONE_SURROGATE = Regex("[\\uD800-\\uDFFF]")

    fun of(lineAt: (Int) -> String, lineCount: Int, range: Range): String? {
        val first = minOf(range.startLine, range.endLine)
        val last = maxOf(range.startLine, range.endLine)
        if (last - first + 1 > MAX_LINES || first < 1 || first > lineCount) return null
        val text = (first..minOf(last, lineCount)).joinToString("\n") { lineAt(it).removeSuffix("\r") }
        return text.takeIf { it.length <= MAX_UNITS && !LONE_SURROGATE.containsMatchIn(it) }
    }

    /** The text of the file on disk, for a write of an agent. A path outside [root] gives null. */
    fun onDisk(root: String, path: String, range: Range): String? = runCatching {
        if (!TaskPath.isRelativeUnder(root, path)) return null
        val lines = String(Files.readAllBytes(Path.of(root, path)), Charsets.UTF_8).split('\n').let { if (it.last().isEmpty()) it.dropLast(1) else it }
        of({ lines[it - 1] }, lines.size, range)
    }.getOrNull()
}
