package com.yeskiy.yreview.session

import java.nio.file.Files

/**
 * One real password file, under a home directory of its own.
 *
 * A test that must prove that the password stays out of a session reads the path of a file
 * that [SecretFile] wrote. A path that a test builds by hand carries no password, so such a
 * test would pass whether the plugin holds the password back or hands it on.
 */
object SecretFixture {

    /** A throwaway value. No session of a user ever runs with it. */
    const val PASSWORD = "9f2c7a10b48e5d3609fa4c81d7be6205"

    const val SESSION_KEY = "0011223344556677"

    fun <T> withFile(body: (SecretFile) -> T): T {
        val home = Files.createTempDirectory("y-review-home")
        try {
            return body(SecretFile.forSession(SESSION_KEY, home).also { it.write(PASSWORD) })
        } finally {
            home.toFile().deleteRecursively()
        }
    }
}
