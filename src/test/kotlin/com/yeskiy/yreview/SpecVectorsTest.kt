package com.yeskiy.yreview

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Each case of `spec/vectors/` gives the same output when the Kotlin code computes it again. */
class SpecVectorsTest {

    private fun read(name: String): JsonElement = Json.parseToJsonElement(Files.readString(SpecVectors.DIR.resolve(name)))

    private fun JsonElement.text(key: String): String = jsonObject.getValue(key).jsonPrimitive.content

    private fun JsonElement.textOrNull(key: String): String? =
        jsonObject[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

    private fun JsonElement.texts(key: String): List<String> = jsonObject.getValue(key).jsonArray.map { it.jsonPrimitive.content }

    private fun JsonElement.number(key: String): Int = jsonObject.getValue(key).jsonPrimitive.int

    private fun cases(file: String, part: String? = null) =
        read(file).let { if (part == null) it.jsonArray else it.jsonObject.getValue(part).jsonArray }

    @Test
    fun `every record case gives its canonical line and identifier`() =
        cases("records.json").forEach { assertEquals(it, SpecVectors.record(it.text("name"), it.text("line"))) }

    @Test
    fun `the record example of the reference has its documented identifier`() = assertTrue(
        cases("records.json").any { it.textOrNull("id") == "b1e2ffb6cbad1181ddfde2543019227ce316a288" },
    )

    @Test
    fun `every repository part matches`() =
        cases("todo-ids.json", "repositoryOf").forEach { assertEquals(it, SpecVectors.repositoryOf(it.textOrNull("basePath"), it.text("rootPath"))) }

    @Test
    fun `every normal text matches`() =
        cases("todo-ids.json", "normal").forEach { assertEquals(it, SpecVectors.normal(it.text("text"))) }

    @Test
    fun `every todo identifier matches`() = cases("todo-ids.json", "forTodo").forEach {
        assertEquals(it, SpecVectors.forTodo(it.text("repository"), it.text("path"), it.text("text"), it.number("order")))
    }

    @Test
    fun `every assigned list matches`() = cases("todo-ids.json", "assign").forEach {
        assertEquals(it, SpecVectors.assign(it.text("repository"), it.text("path"), it.texts("texts")))
    }

    @Test
    fun `every older todo identifier matches`() =
        cases("todo-ids.json", "legacy").forEach { assertEquals(it, SpecVectors.legacy(it.text("path"), it.number("line"))) }

    @Test
    fun `every handle matches`() = cases("handles.json", "of").forEach { assertEquals(it, SpecVectors.handle(it.text("id"))) }

    @Test
    fun `every key matches`() = cases("handles.json", "keyOf").forEach { assertEquals(it, SpecVectors.keyOf(it.text("text"))) }

    @Test
    fun `every match matches`() =
        cases("match.json").forEach { assertEquals(it, SpecVectors.match(it.text("name"), it.text("text"), it.texts("ids"))) }

    @Test
    fun `every note split matches`() =
        cases("notes.json").forEach { assertEquals(it, SpecVectors.note(it.text("name"), it.text("stdout"))) }

    @Test
    fun `every discovery file name matches`() =
        cases("names.json", "discovery").forEach { assertEquals(it, SpecVectors.discovery(it.text("path"))) }

    @Test
    fun `every window folder name matches`() =
        cases("names.json", "window").forEach { assertEquals(it, SpecVectors.window(it.text("path"))) }

    @Test
    fun `every redaction matches`() = cases("redact.json").forEach {
        assertEquals(it, SpecVectors.redact(it.text("name"), it.text("input"), it.texts("homes"), it.texts("projects"), it.texts("repositories")))
    }

    @Test
    fun `the agent table matches the catalog`() = assertEquals(read("agents.json"), SpecVectors.agents())
}
