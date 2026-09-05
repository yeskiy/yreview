package com.yeskiy.yreview.session

import java.nio.file.Files
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText

/**
 * One real bridge file, under a home directory of its own.
 *
 * A test that must prove that the token stays out of a session reads the file through
 * [BridgeDiscovery]. A lookup that the test builds by hand carries no token, so such a
 * test would pass whether the plugin holds the token back or hands it on.
 */
object BridgeFixture {

    const val TOKEN = "0123456789abcdef0123"

    const val URL = "http://127.0.0.1:52431"

    fun <T> withLookup(projectPath: String, body: (BridgeLookup) -> T): T {
        val home = Files.createTempDirectory("y-review-home")
        try {
            val target = BridgeDiscovery.fileFor(home, projectPath)
            target.parent.createDirectories()
            target.writeText("""{"url":"$URL","token":"$TOKEN","projectPath":"$projectPath","pid":42}""")
            return body(BridgeDiscovery.find(home, projectPath))
        } finally {
            home.toFile().deleteRecursively()
        }
    }
}
