package com.yeskiy.yreview.tasks

import org.sqids.Sqids

/** What a handle names. The plugin then searches the tasks it really holds. */
sealed interface HandleKey {

    /** A value the store already holds. It names one record and needs no prefix search. */
    data class Exact(val id: String) : HandleKey

    /** The first characters of the identifier of a comment. */
    data class CommentPrefix(val prefix: String) : HandleKey

    /** The first characters of the path digest of a TODO, and the line it sits on. */
    data class TodoPrefix(val prefix: String, val line: Int) : HandleKey
}

/** What one search of the tasks found. */
sealed interface HandleMatch {

    data class One(val id: String) : HandleMatch

    data object None : HandleMatch

    data class Many(val count: Int) : HandleMatch
}

/**
 * Turns the identifier of a task into a short handle, and a handle back into a task.
 *
 * The git-appraise format never writes an identifier into a record, so the plugin makes one
 * from the digest of the record. That value holds 40 characters, and a model copies it
 * wrong. A handle names the same task in about 9 characters.
 *
 * A handle is derived and never minted. It carries the first [KEY_CHARS] hexadecimal
 * characters of the identifier, which is 32 bits. A TODO handle carries the line as a
 * second number. Nothing is stored, so the same task reads the same handle on every machine
 * and after every restart.
 *
 * A handle is not the answer by itself. [keyOf] reads it, and [match] then searches the
 * identifiers the project really holds. A text that names nothing real finds no candidate.
 * A text that names two tasks answers [HandleMatch.Many], and the caller closes nothing.
 * This is the rule git uses for a short commit hash.
 *
 * Every method here is pure, so a test proves it without a project and without git.
 *
 * A new route that sends a task out of the IDE calls [outward] or [of] first. A new route
 * that reads a value from an agent calls [keyOf] and then [match].
 */
object TaskHandles {

    /** How many hexadecimal characters of the identifier the handle carries. */
    const val KEY_CHARS = 8

    /**
     * The alphabet of a handle.
     *
     * Sqids reads the case of a letter, and a model that lowercases a copied value would
     * break a mixed case handle. Lowercase letters and digits remove that failure.
     */
    private const val ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

    /** One more than the largest key, which is 32 bits. */
    private const val KEY_LIMIT = 1L shl (KEY_CHARS * 4)

    /**
     * The encoder.
     *
     * The block list is empty for two reasons. The encoder throws when a block list forces
     * more retries than the alphabet allows, and an empty list removes every retry. A
     * derived handle must also mean the same thing forever, and an empty list ties the text
     * to the alphabet alone and not to a table of words inside the library.
     */
    private val SQIDS: Sqids = Sqids.builder().alphabet(ALPHABET).blockList(emptySet()).build()

    /**
     * The handle of one identifier.
     *
     * A value that is already a handle comes back unchanged, so a second call on the same
     * list does no harm. A value the store never made comes back unchanged as well.
     */
    fun of(id: String): String = when {
        !TaskIds.isLong(id) -> id
        TaskIds.isTodo(id) -> TaskIds.HANDLE_PREFIX + SQIDS.encode(listOf(todoKey(id), todoLine(id)))
        else -> TaskIds.HANDLE_PREFIX + SQIDS.encode(listOf(keyOfHex(id)))
    }

    /** The same tasks, each one carrying its handle instead of its identifier. */
    fun outward(tasks: List<ReviewTask>): List<ReviewTask> = tasks.map { it.copy(id = of(it.id)) }

    /**
     * What one value an agent sent names, or null when it names nothing the plugin could
     * have written.
     *
     * A long identifier answers [HandleKey.Exact], so both forms take one path from here.
     */
    fun keyOf(text: String): HandleKey? = when {
        TaskIds.isLong(text) -> HandleKey.Exact(text)
        TaskIds.isHandle(text) -> keyOfHandle(text)
        else -> null
    }

    /** True when this value names a TODO line, in the long form or in the short form. */
    fun namesTodo(text: String): Boolean = when (val key = keyOf(text)) {
        is HandleKey.Exact -> TaskIds.isTodo(key.id)
        is HandleKey.TodoPrefix -> true
        else -> false
    }

    /**
     * The identifier this key names, out of the identifiers the project holds.
     *
     * The caller reads the candidates from the store, so this method touches no git and no
     * index. A key that names two tasks answers the count, and the caller then asks the
     * agent for the whole 40 character value.
     */
    fun match(key: HandleKey, ids: List<String>): HandleMatch {
        val hits = ids.filter { names(key, it) }.distinct()
        return when (hits.size) {
            0 -> HandleMatch.None
            1 -> HandleMatch.One(hits.first())
            else -> HandleMatch.Many(hits.size)
        }
    }

    private fun names(key: HandleKey, id: String): Boolean = when (key) {
        is HandleKey.Exact -> id == key.id
        is HandleKey.CommentPrefix -> !TaskIds.isTodo(id) && id.startsWith(key.prefix)
        is HandleKey.TodoPrefix ->
            id.startsWith(TaskIds.TODO_PREFIX + key.prefix) &&
                id.substringAfterLast('-').toIntOrNull() == key.line
    }

    /**
     * Reads the numbers of one handle.
     *
     * A number outside the key range never came from this object, so such a text names
     * nothing. A list of any size other than one or two names nothing either.
     */
    private fun keyOfHandle(handle: String): HandleKey? {
        val numbers = SQIDS.decode(handle.substring(TaskIds.HANDLE_PREFIX.length))
        if (numbers.any { it < 0 || it >= KEY_LIMIT }) return null
        return when (numbers.size) {
            1 -> HandleKey.CommentPrefix(hexOf(numbers[0]))
            2 -> HandleKey.TodoPrefix(hexOf(numbers[0]), numbers[1].toInt())
            else -> null
        }
    }

    private fun keyOfHex(id: String): Long = id.take(KEY_CHARS).toLong(16)

    private fun todoKey(id: String): Long = keyOfHex(id.substring(TaskIds.TODO_PREFIX.length))

    private fun todoLine(id: String): Long = id.substringAfterLast('-').toLong()

    private fun hexOf(key: Long): String = "%0${KEY_CHARS}x".format(key)
}
