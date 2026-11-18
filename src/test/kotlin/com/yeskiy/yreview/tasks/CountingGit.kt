package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.GitResult
import com.yeskiy.yreview.store.GitRunner
import java.util.concurrent.atomic.AtomicInteger

/** Counts every git process of one scan. With [answer], it gives that answer and starts no git. */
internal class Counting(private val git: GitRunner, private val answer: GitResult? = null) : GitRunner {
    val runs = AtomicInteger()
    override fun run(vararg args: String): GitResult = runs.incrementAndGet().let { answer ?: git.run(*args) }
}
