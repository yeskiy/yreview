package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The writer of `location.text` matches the `snippet` vectors of section 17.4. */
class LineTextTest {

    private val snippets = Json.parseToJsonElement(Files.readString(Path.of("spec", "vectors", "carry.json")))
        .jsonObject.getValue("snippet").jsonArray.map { it.jsonObject }

    private val pair = String(Character.toChars(0x1F600))

    private fun rangeOf(case: JsonObject) = case.getValue("range").jsonObject.let { range ->
        Range(
            startLine = range.getValue("startLine").jsonPrimitive.int,
            startColumn = range["startColumn"]?.jsonPrimitive?.int ?: 0,
            endLine = range.getValue("endLine").jsonPrimitive.int,
            endColumn = range["endColumn"]?.jsonPrimitive?.int ?: 0,
        )
    }

    @Test
    fun `every snippet matches`() = snippets.forEach { case ->
        val lines = case.getValue("lines").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(case["text"]?.jsonPrimitive?.contentOrNull, LineText.of({ lines[it - 1] }, lines.size, rangeOf(case)), case.getValue("name").jsonPrimitive.content)
    }

    @Test
    fun `the caps leave the field out`() {
        assertNull(LineText.of({ "x" }, 101, Range(startLine = 1, endLine = 101)))
        assertEquals("x", LineText.of({ "x" }, 100, Range(startLine = 1, endLine = 1)))
        assertNull(LineText.of({ "y".repeat(4001) }, 1, Range(startLine = 1, endLine = 1)))
        assertEquals(4000, LineText.of({ "y".repeat(4000) }, 1, Range(startLine = 1, endLine = 1))?.length)
    }

    @Test
    fun `a valid surrogate pair stays in the text`() =
        assertEquals(pair, LineText.of({ pair }, 1, Range(startLine = 1, endLine = 1)))

    @Test
    fun `the file on disk gives the text of an agent write`() = TempRepo().use { repo ->
        File(repo.dir, "src").mkdirs()
        repo.commit("src/a.txt", "a\r\nb\nc\n")
        assertEquals("b\nc", LineText.onDisk(repo.dir.invariantSeparatorsPath, "src/a.txt", Range(startLine = 2, endLine = 3)))
        assertNull(LineText.onDisk(repo.dir.invariantSeparatorsPath, "src/none.txt", Range(startLine = 1, endLine = 1)))
    }

    @Test
    fun `a path outside the root gives no text`() = TempRepo().use { repo ->
        repo.commit("a.txt", "a\n")
        assertNull(LineText.onDisk(File(repo.dir, "src").invariantSeparatorsPath, "../a.txt", Range(startLine = 1, endLine = 1)))
    }
}
