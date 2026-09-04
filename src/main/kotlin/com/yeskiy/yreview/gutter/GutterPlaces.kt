package com.yeskiy.yreview.gutter

import com.yeskiy.yreview.diff.DiffAnchor

/** The revision and the file path that one editor draws the comments of. */
data class GutterPlace(val key: String, val path: String)

/**
 * The rule that picks what one editor draws.
 *
 * A diff shows two revisions of one file, and each side shows one of them. The side
 * therefore names the revision, and the working tree never answers for a diff side. A
 * left side that took the working tree would draw the comments of the newer revision
 * beside the older text.
 *
 * Every other editor shows the working tree, so the anchor of the file answers.
 *
 * The rule reads plain values, so a test runs it without a running IDE.
 */
object GutterPlaces {

    /** [file] is the place of the file in the working tree, or null when it has no store. */
    fun of(side: DiffAnchor?, file: GutterPlace?): GutterPlace? =
        if (side == null) file else GutterPlace(side.commit, side.path)
}
