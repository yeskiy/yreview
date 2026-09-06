package com.yeskiy.yreview.diff

enum class DiffSide { LEFT, RIGHT }

data class DiffAnchor(
    val side: DiffSide,
    val commit: String,
    val path: String,
    val dirty: Boolean,
)

interface RevisionFacts {
    /** Revision number and repository relative path of the left side, or null. */
    fun beforeRevision(): Pair<String, String>?

    /** Revision number and repository relative path of the right side, or null. */
    fun afterRevision(): Pair<String, String>?

    /**
     * The repository relative path of the right side, or null when that side holds no file.
     *
     * A file that git does not track yet reports a blank revision number, so [afterRevision]
     * answers null for it and this path is the only name of that file.
     */
    fun afterPath(): String?

    /** The current head of the repository, used when a side is the working tree. */
    fun head(): String?
}
