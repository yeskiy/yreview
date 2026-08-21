package com.yeskiy.yreview.ui

import com.intellij.util.text.DateFormatUtil
import com.yeskiy.yreview.store.Comment

/** The time of a review comment, in the words and the format of the IDE. */
object CommentTime {

    const val UNKNOWN = "at an unknown time"

    /** The age of the comment, then the full date and time in brackets. */
    fun label(comment: Comment): String {
        val seconds = secondsOf(comment) ?: return UNKNOWN
        return "${relative(seconds, System.currentTimeMillis())} (${exact(seconds)})"
    }

    /** The seconds since 1970 that the record carries, or null when the field holds no number. */
    fun secondsOf(comment: Comment): Long? = comment.timestamp.trim().toLongOrNull()

    /** A short phrase such as "3 hours ago". The platform selects the words. */
    fun relative(seconds: Long, nowMillis: Long): String =
        DateFormatUtil.formatBetweenDates(seconds * 1000, nowMillis)

    /** The date and the time in the format that the settings of the user select. */
    fun exact(seconds: Long): String = DateFormatUtil.formatDateTime(seconds * 1000)
}
