package com.yeskiy.yreview.bridge

import java.io.File

/** The same five cases, with the channel server of the VS Code extension on Node.js. */
class NodeChannelContractTest : ChannelContractTest() {
    override fun command(): List<String>? {
        val script = File(System.getProperty("y.review.node.channel").orEmpty())
        val node = runCatching { ProcessBuilder("node", "--version").start().waitFor() == 0 }.getOrDefault(false)
        return if (script.isFile && node) listOf("node", script.absolutePath) else null
    }
}
