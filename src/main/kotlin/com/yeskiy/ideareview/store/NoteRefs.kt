package com.yeskiy.ideareview.store

object NoteRefs {
    const val DISCUSS = "refs/notes/devtools/discuss"
    const val ANALYSES = "refs/notes/devtools/analyses"
    const val LOCAL = "refs/notes/idea-review/local"

    val ALL = listOf(DISCUSS, ANALYSES, LOCAL)

    fun isShared(ref: String): Boolean = ref != LOCAL

    /** The ref a new comment goes to. The choice is the ref itself, never a field in the note. */
    fun refFor(share: Boolean): String = if (share) DISCUSS else LOCAL
}
