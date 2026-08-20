package com.yeskiy.ideareview.settings

/**
 * Where a new comment goes when the person does not choose for one comment.
 * The default is [LOCAL_ONLY], because sharing writes to a remote.
 */
enum class CommentSharing(val label: String, val shareByDefault: Boolean) {
    LOCAL_ONLY("Local only", false),
    SHARED("Shared", true),
}
