package com.yeskiy.ideareview.bridge

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

sealed interface ResolveParse {
    data class Ids(val ids: List<String>) : ResolveParse

    data class Bad(val reason: String) : ResolveParse
}

/**
 * Reads the body of POST /resolve.
 *
 * Every value in the body comes from outside the IDE, so the plugin checks each one here.
 * A value that reaches this far is a comment id and nothing else. No other text ever
 * reaches git.
 */
object ResolveRequest {

    const val MAX_IDS = 200

    private const val FIELD = "ids"

    private val ID = Regex("^[0-9a-f]{40}$")

    fun isId(text: String): Boolean = ID.matches(text)

    fun parse(body: String): ResolveParse {
        val root = runCatching { Json.parseToJsonElement(body) }.getOrNull() as? JsonObject
            ?: return ResolveParse.Bad("The body must be a JSON object.")
        if (root.keys != setOf(FIELD)) {
            return ResolveParse.Bad("The body must hold the field ids and no other field.")
        }
        val array = root[FIELD] as? JsonArray
            ?: return ResolveParse.Bad("The field ids must be an array.")
        if (array.isEmpty()) return ResolveParse.Bad("The field ids must hold one id or more.")
        if (array.size > MAX_IDS) return ResolveParse.Bad("The field ids must hold $MAX_IDS ids or fewer.")

        val ids = array.map { element ->
            val text = (element as? JsonPrimitive)?.takeIf { it.isString }?.content
                ?: return ResolveParse.Bad("Every id must be a string.")
            if (!isId(text)) {
                return ResolveParse.Bad("An id must hold 40 lowercase hexadecimal characters.")
            }
            text
        }
        return ResolveParse.Ids(ids.distinct())
    }
}
