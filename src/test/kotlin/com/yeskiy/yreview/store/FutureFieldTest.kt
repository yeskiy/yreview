package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** A reader of version 1.0 reads, resolves and rewrites a record that holds `location.text`. */
class FutureFieldTest {

    private val case = Json.parseToJsonElement(Files.readString(Path.of("spec", "vectors", "carry.json")))
        .jsonObject.getValue("compat").jsonArray.first().jsonObject

    private val line = case.getValue("line").jsonPrimitive.content

    private val id = case.getValue("id").jsonPrimitive.content

    @Test
    fun `the record decodes with the identifier of the vector`() = assertEquals(id, CommentJson.decode(line).id())

    @Test
    fun `a resolve names the identifier and a delete of another record keeps the line`() = TempRepo().use { repo ->
        File(repo.dir, "src").mkdirs()
        val head = repo.commit("src/a.txt", "a\nb\nc\n")
        val gateway = NotesGateway(repo.git)
        gateway.append(NoteRefs.LOCAL, head, line)
        val book = CommentBook(gateway, "t@example.com")
        val other = book.add(NoteRefs.LOCAL, head, "src/a.txt", Range(startLine = 1, endLine = 1), "Other.")
        val stored = book.open(head).first { it.id == id }

        val resolve = book.resolve(stored)
        book.remove(listOf(other))

        val lines = gateway.readLines(NoteRefs.LOCAL, head)
        assertTrue(line in lines, "the line is no longer byte for byte in the note")
        assertEquals(id, resolve.comment.original)
        assertFalse(lines.last().contains("\"text\""), "the resolve record holds location.text")
        assertEquals(id, book.closed(head).single().id)
    }
}
