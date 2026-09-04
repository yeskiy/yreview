package com.yeskiy.yreview.session

import com.intellij.util.messages.Topic

fun interface SessionNameListener {
    fun namesChanged()
}

/** Fires when something that names a tab changed, so every tab writes its name again. */
val SESSION_NAMES: Topic<SessionNameListener> =
    Topic.create("y review session names", SessionNameListener::class.java)
