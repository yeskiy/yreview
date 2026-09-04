package com.yeskiy.yreview.bridge

/** What one send leaves behind: the report of that send, and the text the clipboard holds. */
data class PushResult(val report: SendReport, val clipboard: String?)

/**
 * What a send keeps after a push that the session refused.
 *
 * A push that fails leaves the user with a warning and nothing else. The tasks stand in
 * the review folder, and the prompt that names them stands nowhere. This decision hands
 * that prompt to the clipboard, so the user can paste it in the session. The warning
 * stays, because the push really did fail.
 */
object PushFallback {

    fun of(report: SendReport, prompt: String): PushResult =
        if (report.problem == null) {
            PushResult(report, null)
        } else {
            PushResult(report.copy(copied = true), prompt)
        }
}
