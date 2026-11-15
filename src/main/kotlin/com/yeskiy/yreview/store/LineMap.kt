package com.yeskiy.yreview.store

import java.io.ByteArrayOutputStream

/** One hunk of `git diff -U0`. [removed] holds the old lines that the hunk replaced. */
data class Hunk(val oldStart: Int, val oldCount: Int, val newStart: Int, val newCount: Int, val removed: List<String>)

/** The changes of one path from a comment commit to the working tree. */
data class FileDiff(val path: String, val deleted: Boolean, val binary: Boolean, val hunks: List<Hunk>)

/** Where one open comment stands in the working tree. spec/format.md section 17 states the rule. */
sealed interface Carry {
    data class Same(val range: Range?) : Carry
    data class Outdated(val range: Range, val original: List<String>) : Carry
    data object Gone : Carry
    data object Missing : Carry
}

/** The range that the editor draws, and null for a comment that it does not draw. */
val Carry.shown: Range?
    get() = when (this) {
        is Carry.Same -> range
        is Carry.Outdated -> range
        else -> null
    }

object LineMap {

    private val HUNK = Regex("""^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@""")

    private val ESCAPES = mapOf(
        '\\' to 0x5c, '"' to 0x22, 't' to 0x09, 'n' to 0x0a, 'r' to 0x0d,
        'a' to 0x07, 'b' to 0x08, 'f' to 0x0c, 'v' to 0x0b,
    )

    private const val DIFF = "diff --git "

    fun lines(text: String): List<String> =
        if (text.isEmpty()) emptyList() else text.removeSuffix("\n").split('\n').map { it.removeSuffix("\r") }

    fun parse(text: String): Map<String, FileDiff> {
        val all = lines(text)
        val starts = all.indices.filter { all[it].startsWith(DIFF) }
        return starts.mapIndexedNotNull { index, start -> fileOf(all.subList(start, starts.getOrElse(index + 1) { all.size })) }
            .associateBy { it.path }
    }

    /** A C string of git with its quotes, or a plain name that loses one tab at its end. Null when broken. */
    fun unquote(text: String): String? {
        if (!text.startsWith("\"")) return text.removeSuffix("\t")
        val bytes = ByteArrayOutputStream()
        var index = 1
        while (index < text.length) {
            val char = text[index]
            when {
                char == '"' -> return bytes.toString(Charsets.UTF_8)
                char != '\\' -> {
                    val chars = Character.toChars(text.codePointAt(index))
                    bytes.write(String(chars).toByteArray(Charsets.UTF_8))
                    index += chars.size
                }
                text.getOrNull(index + 1) in '0'..'7' -> {
                    val digits = text.substring(index + 1).take(3)
                    if (digits.length < 3 || digits.any { it !in '0'..'7' }) return null
                    bytes.write(digits.toInt(8))
                    index += 4
                }
                else -> {
                    bytes.write(ESCAPES[text.getOrNull(index + 1)] ?: return null)
                    index += 2
                }
            }
        }
        return null
    }

    /** Section 17.3 on top of section 17.2. [text] is `location.text`, [head] is a comment of HEAD or of a folder store. */
    fun carry(
        diff: FileDiff?,
        range: Range?,
        current: List<String>,
        text: String? = null,
        head: Boolean = false,
        refused: Boolean = false,
    ): Carry {
        val base = when {
            refused -> Carry.Missing
            head -> Carry.Same(range)
            else -> mapped(diff, range, current)
        }
        if (text == null || range == null || base is Carry.Gone || diff?.binary == true) return base
        val wanted = text.split('\n')
        val first = minOf(range.startLine, range.endLine)
        val near = base.shown?.let { minOf(it.startLine, it.endLine) } ?: first
        val match = (1..current.size - wanted.size + 1)
            .filter { at -> wanted.indices.all { current[at - 1 + it] == wanted[it] } }
            .minByOrNull { kotlin.math.abs(it - near) }
        if (match != null) return Carry.Same(range.copy(startLine = range.startLine + match - first, endLine = range.endLine + match - first))
        if (head || refused) return base
        val shown = base.shown ?: range
        val top = minOf(shown.startLine, shown.endLine).coerceIn(1, current.size)
        return Carry.Outdated(Range(startLine = top, endLine = maxOf(shown.startLine, shown.endLine).coerceIn(top, current.size)), wanted)
    }

    /** Section 17.2: the diff rule alone. */
    private fun mapped(diff: FileDiff?, range: Range?, current: List<String>): Carry {
        if (diff == null) return Carry.Same(range)
        if (diff.deleted || current.isEmpty()) return Carry.Gone
        if (range == null) return Carry.Same(null)
        val first = minOf(range.startLine, range.endLine)
        val last = maxOf(range.startLine, range.endLine)
        val clamp = { line: Int -> line.coerceIn(1, current.size) }
        if (diff.binary) return Carry.Outdated(Range(startLine = clamp(first), endLine = clamp(first)), emptyList())
        val hunks = diff.hunks
        val touching = hunks.filter { touches(it, first, last) }
        if (touching.isEmpty()) {
            return Carry.Same(range.copy(startLine = shift(hunks, range.startLine), endLine = shift(hunks, range.endLine)))
        }
        val top = touching.first().let {
            if (it.oldCount > 0 && it.oldStart <= first) (if (it.newCount > 0) it.newStart else it.newStart + 1)
            else shift(hunks, first)
        }
        val bottom = touching.last().let {
            if (it.oldCount > 0 && it.oldStart + it.oldCount - 1 >= last) (if (it.newCount > 0) it.newStart + it.newCount - 1 else it.newStart)
            else shift(hunks, last)
        }
        val original = (first..last).map { line ->
            val holder = hunks.firstOrNull { it.oldCount > 0 && line in it.oldStart until it.oldStart + it.oldCount }
            holder?.removed?.getOrNull(line - holder.oldStart) ?: current.getOrNull(shift(hunks, line) - 1).orEmpty()
        }
        return Carry.Outdated(Range(startLine = clamp(top), endLine = clamp(maxOf(bottom, top))), original)
    }

    private fun shift(hunks: List<Hunk>, line: Int): Int =
        line + hunks.filter { before(it, line) }.sumOf { it.newCount - it.oldCount }

    private fun before(hunk: Hunk, line: Int): Boolean =
        if (hunk.oldCount > 0) hunk.oldStart + hunk.oldCount - 1 < line else hunk.oldStart < line

    private fun touches(hunk: Hunk, first: Int, last: Int): Boolean =
        if (hunk.oldCount > 0) hunk.oldStart <= last && hunk.oldStart + hunk.oldCount - 1 >= first
        else hunk.oldStart in first until last

    private fun fileOf(block: List<String>): FileDiff? {
        val firstHunk = block.indexOfFirst { HUNK.containsMatchIn(it) }.let { if (it < 0) block.size else it }
        val headers = block.subList(0, firstHunk)
        val path = named(headers, "--- ", "a/") ?: named(headers, "+++ ", "b/") ?: pathOfDiffLine(block.first()) ?: return null
        val body = block.subList(firstHunk, block.size)
        val starts = body.indices.filter { HUNK.containsMatchIn(body[it]) }
        return FileDiff(
            path = path,
            deleted = headers.any { it == "+++ /dev/null" || it.startsWith("deleted file mode") },
            binary = headers.any { it.startsWith("Binary files ") },
            hunks = starts.mapIndexed { index, start -> hunkOf(body.subList(start, starts.getOrElse(index + 1) { body.size })) },
        )
    }

    private fun named(headers: List<String>, prefix: String, side: String): String? =
        headers.firstOrNull { it.startsWith(prefix) && it != "$prefix/dev/null" }
            ?.let { unquote(it.removePrefix(prefix)) }
            ?.takeIf { it.startsWith(side) }
            ?.removePrefix(side)

    private fun pathOfDiffLine(line: String): String? {
        val rest = line.removePrefix(DIFF)
        if (rest.startsWith("\"")) return unquote(rest)?.takeIf { it.startsWith("a/") }?.removePrefix("a/")
        if ((rest.length - 5) % 2 != 0 || rest.length <= 5) return null
        val name = rest.substring(2, 2 + (rest.length - 5) / 2)
        return name.takeIf { rest == "a/$name b/$name" }
    }

    private fun hunkOf(lines: List<String>): Hunk {
        val head = HUNK.find(lines.first())!!.groupValues
        return Hunk(
            oldStart = head[1].toInt(),
            oldCount = head[2].ifEmpty { "1" }.toInt(),
            newStart = head[3].toInt(),
            newCount = head[4].ifEmpty { "1" }.toInt(),
            removed = lines.drop(1).filter { it.startsWith("-") }.map { it.substring(1) },
        )
    }
}
