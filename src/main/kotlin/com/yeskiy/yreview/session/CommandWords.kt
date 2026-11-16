package com.yeskiy.yreview.session

import java.io.File

/**
 * The words of an agent command. A value that is one existing file is one word. Else blanks divide
 * words, quotes group them, an open quote runs to the end, and a backslash is plain text.
 */
object CommandWords {

    private const val BLANKS = " \t\r\n"

    private const val QUOTES = "\"'"

    fun of(value: String, isFile: (String) -> Boolean = { runCatching { File(it).isFile }.getOrDefault(false) }): List<String> {
        val trimmed = value.trim { it in BLANKS }
        if (trimmed.isEmpty()) return emptyList()
        if (isFile(trimmed)) return listOf(trimmed)
        val words = mutableListOf<String>()
        val word = StringBuilder()
        var started = false
        var quote: Char? = null
        for (char in trimmed) {
            when {
                quote != null -> if (char == quote) quote = null else word.append(char)
                char in BLANKS -> if (started) {
                    words += word.toString()
                    word.clear()
                    started = false
                }
                else -> {
                    started = true
                    if (char in QUOTES) quote = char else word.append(char)
                }
            }
        }
        if (started) words += word.toString()
        return words
    }
}
