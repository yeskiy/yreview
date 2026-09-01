package com.yeskiy.yreview.store

import com.intellij.openapi.vfs.VirtualFile

enum class StoreKind { GIT, FOLDER }

/** Where one comment of one file goes, and under which key. */
data class ReviewAnchor(
    val kind: StoreKind,
    val root: VirtualFile,
    val key: String,
    val path: String,
)

/** One root that may hold review records, and the kind of store that reads it. */
data class StoreRoot(val kind: StoreKind, val root: VirtualFile)

/**
 * The answer of the resolver.
 *
 * [NoCommit] and [NoPlace] are two different refusals. A repository with no commit never
 * falls back to a folder store, because a nested repository owns its own files.
 */
sealed interface AnchorResult {
    data class Found(val anchor: ReviewAnchor) : AnchorResult
    data object NoCommit : AnchorResult
    data object NoPlace : AnchorResult
}
