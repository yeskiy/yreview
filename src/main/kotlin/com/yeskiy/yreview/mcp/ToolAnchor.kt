package com.yeskiy.yreview.mcp

import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.ReviewService

/** The MCP tools write only to a store of the project. A store outside the project is refused. */
internal object ToolAnchor {

    /** The error text that the tool returns, or null when the tool may write to the anchor. */
    fun problemOf(service: ReviewService, found: AnchorResult, relative: String): String? = when (found) {
        is AnchorResult.Found -> if (service.isProjectRoot(found.anchor.root.path)) null else noStore(relative)
        AnchorResult.NoCommit -> "The repository of $relative has no commit yet."
        AnchorResult.NoPlace, AnchorResult.HomeFile -> noStore(relative)
    }

    private fun noStore(relative: String) = "The project holds no review store for $relative."
}
