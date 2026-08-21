package com.yeskiy.yreview.store

import com.intellij.util.messages.Topic

fun interface ReviewCommentListener {
    fun commentsChanged()
}

/** Fires after every write, so the tool window and the gutter read the store again. */
val REVIEW_COMMENTS: Topic<ReviewCommentListener> =
    Topic.create("y review comments", ReviewCommentListener::class.java)
