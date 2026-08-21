package com.yeskiy.yreview.diff

object DiffAnchorResolver {

    fun resolve(facts: RevisionFacts, side: DiffSide): DiffAnchor? {
        val own = when (side) {
            DiffSide.LEFT -> facts.beforeRevision()
            DiffSide.RIGHT -> facts.afterRevision()
        }
        if (own != null) {
            return DiffAnchor(side, commit = own.first, path = own.second, dirty = false)
        }

        // The left side never falls back. A missing before revision means the file is
        // new, and a comment on a file that did not exist has nowhere to anchor.
        if (side == DiffSide.LEFT) return null

        val other = facts.beforeRevision() ?: return null
        val head = facts.head() ?: return null
        return DiffAnchor(side, commit = head, path = other.second, dirty = true)
    }
}
