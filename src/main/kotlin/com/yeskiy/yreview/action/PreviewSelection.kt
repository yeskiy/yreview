package com.yeskiy.yreview.action

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Document
import com.intellij.openapi.extensions.ExtensionPointName
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

/** One end of a preview selection: the offsets of its element and the line breaks before the point. */
data class Edge(val from: Int, val to: Int, val breaks: Int)

data class Picked(val start: Edge, val end: Edge)

/** The source lines of a selection in the JetBrains Markdown preview. */
object PreviewSelection {

    private const val MAX_BREAKS = 1_000_000

    private fun lineIn(edge: Edge, lineOf: (Int) -> Int): Int {
        val first = lineOf(edge.from)
        return (first + edge.breaks).coerceIn(first, lineOf(maxOf(edge.from, edge.to - 1)))
    }

    fun lines(start: Edge, end: Edge, lineOf: (Int) -> Int): IntRange {
        val first = lineIn(start, lineOf)
        return first..maxOf(first, lineIn(end, lineOf))
    }

    private fun edgeOf(value: JsonElement?): Edge? = runCatching {
        val fields = value!!.jsonObject
        Edge(
            fields.getValue("from").jsonPrimitive.int,
            fields.getValue("to").jsonPrimitive.int,
            fields.getValue("breaks").jsonPrimitive.int,
        )
    }.getOrNull()?.takeIf { it.from >= 0 && it.to > it.from && it.breaks in 0..MAX_BREAKS }

    /** The selection of the page message, or null. The page is untrusted. */
    fun parse(json: String): Picked? = runCatching { Json.parseToJsonElement(json).jsonObject }
        .getOrNull()
        ?.let { fields ->
            val start = edgeOf(fields["start"]) ?: return null
            val end = edgeOf(fields["end"]) ?: return null
            Picked(start, end)
        }
}

/** The last selection of each preview panel. The pipe writes from the JCEF thread, the action reads on the EDT. */
object PreviewSelections {

    private data class Kept(val picked: Picked, val stamp: Long)

    private val kept = ConcurrentHashMap<Any, Kept>()

    fun put(panel: Any, picked: Picked?, stamp: Long) {
        if (picked == null) kept.remove(panel) else kept[panel] = Kept(picked, stamp)
    }

    fun remove(panel: Any) {
        kept.remove(panel)
    }

    /** The selection of [panel] while the document is still at [stamp], else null. */
    fun of(panel: Any, stamp: Long): Picked? = kept[panel]?.takeIf { it.stamp == stamp }?.picked

    fun keys(): Set<Any> = kept.keys.toSet()
}

/** The source lines of a preview selection. The Markdown module gives the only implementation. */
interface PreviewLines {

    fun linesOf(event: AnActionEvent, document: Document): IntRange?

    companion object {
        val EP = ExtensionPointName<PreviewLines>("com.yeskiy.yreview.previewLines")

        fun of(event: AnActionEvent, document: Document): IntRange? =
            EP.extensionList.firstNotNullOfOrNull { it.linesOf(event, document) }
    }
}
