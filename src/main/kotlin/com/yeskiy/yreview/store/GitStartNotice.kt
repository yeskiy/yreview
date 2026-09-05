package com.yeskiy.yreview.store

import com.intellij.openapi.components.Service
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Keeps the message about a git that did not start to one message for each project.
 *
 * Every read of the store runs git, so a git that does not start fails many times in one
 * moment. The user reads the problem once, and the other failures stay quiet.
 */
@Service(Service.Level.PROJECT)
class GitStartNotice {

    private val told = AtomicBoolean(false)

    /** True for the first call alone. That caller shows the message. */
    fun first(): Boolean = told.compareAndSet(false, true)
}
