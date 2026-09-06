package com.yeskiy.yreview.tasks

/**
 * The text of one task, as it leaves the plugin.
 *
 * A review comment reaches a clipboard, a file and the channel, and a person pastes the
 * clipboard into a terminal. A terminal reads a control character as an instruction, so an
 * escape sequence inside a comment runs there. The text of a comment comes from the person
 * who wrote the record, therefore every exit cleans it.
 *
 * The rule reads both ranges of control characters. The first one runs from U+0000 to
 * U+001F, and the second one runs from U+007F to U+009F. A terminal acts on U+009B of the
 * second range as it acts on the escape sequence, because that one character starts a
 * control sequence.
 *
 * The rule keeps the tab, the carriage return and the line feed, because a comment holds
 * lines. It drops every other control character.
 *
 * The path of a task comes from the same record, and a path holds no line. [path]
 * therefore keeps no control character at all.
 *
 * A caller with a length cap takes [cut] after the filter, so no cut of a clean text puts
 * a half character back into it.
 */
object TaskText {

    /** The control characters a comment may hold. */
    const val KEPT = "\t\r\n"

    /** True when this character is a control character, whatever a reader makes of it. */
    fun isAnyControl(value: Char): Boolean = value.code < 0x20 || value.code in 0x7f..0x9f

    /** True when a terminal reads this character as an instruction. */
    fun isControl(value: Char): Boolean = isAnyControl(value) && value !in KEPT

    /** The text a caller may hand to a clipboard, to a file or to the channel. */
    fun of(text: String): String = text.filterNot { isControl(it) }

    /** The path a caller may hand to a clipboard, to a file or to the channel. */
    fun path(value: String): String = value.filterNot { isAnyControl(it) }

    /**
     * The first [limit] code units of a text, and never one half of a character.
     *
     * Kotlin counts a code unit, and a character outside the basic plane takes two of
     * them. A cut between the two halves leaves one half alone, and the UTF-8 encoder
     * writes the replacement character for such a half. The cut therefore drops a half
     * that lost its pair.
     */
    fun cut(text: String, limit: Int): String {
        val short = text.take(limit)
        return if (short.lastOrNull()?.isHighSurrogate() == true) short.dropLast(1) else short
    }
}
