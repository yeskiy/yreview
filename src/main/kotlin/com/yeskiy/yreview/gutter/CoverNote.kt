package com.yeskiy.yreview.gutter

import com.intellij.openapi.util.text.HtmlBuilder
import com.intellij.openapi.util.text.HtmlChunk

/** The note at the top of the gutter card when more than one open comment covers the line. */
object CoverNote {

    private const val HEAD = "<html><body>"

    private const val TAIL = "</body></html>"

    fun text(cover: Int): String? = if (cover > 1) "$cover open comments cover this line." else null

    /** Puts the note into the body of [card], so the tooltip keeps one HTML document. */
    fun html(cover: Int, card: String): String {
        val note = text(cover) ?: return card
        return HtmlBuilder()
            .append(HtmlChunk.text(note).italic())
            .append(HtmlChunk.hr())
            .appendRaw(card.removePrefix(HEAD).removeSuffix(TAIL))
            .wrapWithHtmlBody()
            .toString()
    }

    fun plain(cover: Int, card: String): String = text(cover)?.let { "$it\n\n$card" } ?: card
}
