package com.yeskiy.yreview.diff

import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.ContentRevision

/**
 * Reads the revision of each diff side from the change behind the request. A working tree
 * revision reports a blank revision number, so [pairOf] rejects blanks and lets the
 * resolver fall back to the head.
 */
class ChangeRevisionFacts(
    private val change: Change,
    private val head: String?,
    private val rootPath: String,
) : RevisionFacts {

    override fun beforeRevision(): Pair<String, String>? = pairOf(change.beforeRevision)

    override fun afterRevision(): Pair<String, String>? = pairOf(change.afterRevision)

    override fun afterPath(): String? = relative(change.afterRevision?.file?.path)

    override fun head(): String? = head

    private fun pairOf(revision: ContentRevision?): Pair<String, String>? {
        val number = revision?.revisionNumber?.asString() ?: return null
        if (number.isBlank()) return null
        return relative(revision.file.path)?.let { number to it }
    }

    private fun relative(path: String?): String? {
        if (path == null || !path.startsWith("$rootPath/")) return null
        return path.removePrefix("$rootPath/")
    }
}
