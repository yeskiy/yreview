package com.yeskiy.ideareview.store

import com.intellij.util.messages.Topic

fun interface ReviewCommentListener {
    fun commentsChanged()
}

/** Fires after every write, so the tool window and the gutter read the store again. */
val REVIEW_COMMENTS: Topic<ReviewCommentListener> =
    Topic.create("idea review comments", ReviewCommentListener::class.java)
