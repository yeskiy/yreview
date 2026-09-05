package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GitRunnerTest {

    @Test
    fun `an answer under the limit comes back whole`() {
        TempRepo().use { repo ->
            val result = repo.git.run("rev-parse", "--is-inside-work-tree")
            assertTrue(result.ok, result.stderr)
            assertEquals("true", result.stdout.trim())
        }
    }

    @Test
    fun `an answer over the limit fails and carries no text`() {
        TempRepo().use { repo ->
            val result = repo.git.run("cat-file", "-p", blob(repo, ProcessGitRunner.MAX_OUTPUT_BYTES + OVERSHOOT))
            assertFalse(result.ok, "a stream over the limit must give a failed result")
            assertEquals("", result.stdout)
            assertTrue(result.stderr.contains("${ProcessGitRunner.MAX_OUTPUT_BYTES}"), result.stderr)
        }
    }

    @Test
    fun `an answer at the limit still comes back`() {
        TempRepo().use { repo ->
            val result = repo.git.run("cat-file", "-p", blob(repo, ProcessGitRunner.MAX_OUTPUT_BYTES))
            assertTrue(result.ok, result.stderr)
            assertEquals(ProcessGitRunner.MAX_OUTPUT_BYTES, result.stdout.length)
        }
    }

    /** Writes a blob of that many bytes into the object database and returns its name. */
    private fun blob(repo: TempRepo, size: Int): String {
        val file = File(repo.dir, "big.bin")
        file.writeBytes(ByteArray(size) { FILLER })
        val hash = repo.git.run("hash-object", "-w", "big.bin")
        assertTrue(hash.ok, hash.stderr)
        file.delete()
        return hash.stdout.trim()
    }

    private companion object {
        const val OVERSHOOT = 1024 * 1024
        const val FILLER = 'a'.code.toByte()
    }
}
