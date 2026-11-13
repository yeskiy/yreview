package com.yeskiy.yreview.settings

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlin.io.path.exists
import kotlin.io.path.readText

/**
 * Puts the review server into an MCP (Model Context Protocol) file that the user can share
 * with other servers. The write keeps every other key and every other server of the file.
 */
object McpFile {

    private const val SERVERS = "mcpServers"

    private const val TEMPORARY_SUFFIX = ".tmp"

    private val JSON = Json { prettyPrint = true }

    /** The merged text, or the problem that stops the write. */
    sealed interface Merge {
        data class Text(val value: String) : Merge
        data class Problem(val value: String) : Merge
    }

    /**
     * Adds each server of [wanted] to the servers of [existing]. A server of the same name
     * gets the new entry. A null [existing] means that no file stands there.
     */
    fun merge(existing: String?, wanted: String): Merge {
        val add = objectOf(wanted)?.get(SERVERS) as? JsonObject
            ?: return Merge.Problem("The plugin made no server entry to write.")
        val base = if (existing == null || existing.isBlank()) JsonObject(emptyMap())
        else objectOf(existing) ?: return Merge.Problem("The file holds no valid JSON object, so the plugin did not change it.")
        val servers = when (val found = base[SERVERS]) {
            null -> JsonObject(emptyMap())
            is JsonObject -> found
            else -> return Merge.Problem("The $SERVERS key of the file holds no object, so the plugin did not change it.")
        }
        return Merge.Text(JSON.encodeToString(JsonObject.serializer(), JsonObject(base + (SERVERS to JsonObject(servers + add)))))
    }

    /** Null after a good write, or the text of the problem. The file on disk changes only on success. */
    fun write(file: Path, wanted: String): String? {
        val existing = if (file.exists()) file.readText() else null
        return when (val merged = merge(existing, wanted)) {
            is Merge.Problem -> "${merged.value} File: ${file.fileName}"
            is Merge.Text -> {
                Files.createDirectories(file.parent)
                val temporary = Files.createTempFile(file.parent, file.fileName.toString(), TEMPORARY_SUFFIX)
                try {
                    Files.writeString(temporary, merged.value)
                    move(temporary, file)
                } finally {
                    Files.deleteIfExists(temporary)
                }
                null
            }
        }
    }

    private fun objectOf(text: String): JsonObject? =
        try {
            Json.parseToJsonElement(text) as? JsonObject
        } catch (invalid: SerializationException) {
            null
        }

    /** A reader of the file never sees half a document. */
    private fun move(temporary: Path, target: Path) {
        try {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (unsupported: AtomicMoveNotSupportedException) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING)
        }
    }
}
