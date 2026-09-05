package com.yeskiy.yreview.tasks

/**
 * The text of one task, as it leaves the plugin.
 *
 * A review comment reaches a clipboard, a file and the channel, and a person pastes the
 * clipboard into a terminal. A terminal reads a control character as an instruction, so an
 * escape sequence inside a comment runs there. The text of a comment comes from the person
 * who wrote the record, therefore every exit cleans it.
 *
 * The rule keeps the tab, the carriage return and the line feed, because a comment holds
 * lines. It drops every other control character.
 *
 * The path of a task comes from the same record, and a path holds no line. [path]
 * therefore keeps no control character at all.
 */
object TaskText {

    /** The control characters a comment may hold. */
    const val KEPT = "\t\r\n"

    /** True when this character is a control character, whatever a reader makes of it. */
    fun isAnyControl(value: Char): Boolean = value.code < 0x20 || value.code == 0x7f

    /** True when a terminal reads this character as an instruction. */
    fun isControl(value: Char): Boolean = isAnyControl(value) && value !in KEPT

    /** The text a caller may hand to a clipboard, to a file or to the channel. */
    fun of(text: String): String = text.filterNot { isControl(it) }

    /** The path a caller may hand to a clipboard, to a file or to the channel. */
    fun path(value: String): String = value.filterNot { isAnyControl(it) }
}
