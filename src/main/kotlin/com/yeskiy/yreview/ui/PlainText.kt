package com.yeskiy.yreview.ui

/**
 * The rule for a value that a component shows as plain text.
 *
 * Swing draws a text that starts with the markup tag as markup, and the label of the
 * platform adds no escape of its own. A value of a review record comes from the person who
 * wrote the record, so it can carry that tag and it can be as long as a book. A value that
 * starts with the tag reads as [UNKNOWN], and a long value ends after the cap.
 *
 * A builder of markup needs no rule from here, because it escapes every character itself.
 */
object PlainText {

    /** What Swing draws as markup. A label shows the text of a value, and never markup. */
    const val MARKUP = "<html"

    /** The word that stands in place of a value a component cannot show. */
    const val UNKNOWN = "unknown"

    /** The mark at the end of a value that the cap cut. */
    const val MORE = "..."

    /** The longest value a label draws. A longer one pushes every other control out of view. */
    const val LONGEST = 200

    /** True when a component draws this value as markup. */
    fun isMarkup(value: String): Boolean = value.trimStart().startsWith(MARKUP, ignoreCase = true)

    /** The value that a component can show. */
    fun of(value: String?, limit: Int = LONGEST): String {
        val text = value.orEmpty()
        if (isMarkup(text)) return UNKNOWN
        if (text.length <= limit) return text
        return text.take(limit).trimEnd() + MORE
    }
}
