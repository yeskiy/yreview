package com.yeskiy.yreview.handoff

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DoneLogTest {

    private val one = "c3f9a12aabbccddeeff00112233445566778899a"
    private val two = "0123456789abcdef0123456789abcdef01234567"
    private val three = "todo-0123456789abcdef0123456789abcdef01234567-88"

    private fun withFile(body: (Path) -> Unit) {
        val folder = Files.createTempDirectory("y-review-done")
        try {
            body(folder.resolve("done.txt"))
        } finally {
            folder.toFile().deleteRecursively()
        }
    }

    private fun append(file: Path, text: String) {
        Files.writeString(file, text, StandardOpenOption.CREATE, StandardOpenOption.APPEND)
    }

    /** A line that no read can hold takes several reads to pass, so the test reads until the end. */
    private fun drain(log: DoneLog): List<String> = (1..READS).flatMap { log.newIds() }

    private fun tooLong(): String = "x".repeat((DoneLog.MAX_READ * 2).toInt())

    @Test
    fun `gives nothing when the file is missing`() {
        withFile { file -> assertTrue(DoneLog(file).newIds().isEmpty()) }
    }

    @Test
    fun `reads every whole line`() {
        withFile { file ->
            append(file, "$one\n$two\n")
            assertEquals(listOf(one, two), DoneLog(file).newIds())
        }
    }

    @Test
    fun `reads a todo identifier`() {
        withFile { file ->
            append(file, "$three\n")
            assertEquals(listOf(three), DoneLog(file).newIds())
        }
    }

    @Test
    fun `reads a line only once`() {
        withFile { file ->
            append(file, "$one\n")
            val log = DoneLog(file)
            assertEquals(listOf(one), log.newIds())
            assertEquals(emptyList(), log.newIds())
        }
    }

    @Test
    fun `reads the lines an agent appends after the first read`() {
        withFile { file ->
            append(file, "$one\n")
            val log = DoneLog(file)
            log.newIds()
            append(file, "$two\n$three\n")
            assertEquals(listOf(two, three), log.newIds())
        }
    }

    @Test
    fun `waits for the end of a line the agent still writes`() {
        withFile { file ->
            append(file, "$one\n" + two.dropLast(1))
            val log = DoneLog(file)
            assertEquals(listOf(one), log.newIds())
            append(file, two.takeLast(1) + "\n")
            assertEquals(listOf(two), log.newIds())
        }
    }

    @Test
    fun `reads a file that ends with a carriage return`() {
        withFile { file ->
            append(file, "$one\r\n$two\r\n")
            assertEquals(listOf(one, two), DoneLog(file).newIds())
        }
    }

    @Test
    fun `passes an empty line`() {
        withFile { file ->
            append(file, "$one\n\n   \n$two\n")
            assertEquals(listOf(one, two), DoneLog(file).newIds())
        }
    }

    @Test
    fun `starts again when the file became shorter`() {
        withFile { file ->
            append(file, "$one\n$two\n")
            val log = DoneLog(file)
            log.newIds()
            Files.writeString(file, "$three\n")
            assertEquals(listOf(three), log.newIds())
        }
    }

    @Test
    fun `refuses a line that is not an identifier of the plugin`() {
        withFile { file ->
            append(file, "$one\n../../etc/passwd\n--exec=calc.exe\nrefs/notes/x\n$two\n")
            val log = DoneLog(file)
            assertEquals(listOf(one, two), log.newIds())
            assertEquals(3, log.rejected)
        }
    }

    @Test
    fun `counts the read position in bytes`() {
        withFile { file ->
            append(file, "$one\n")
            val log = DoneLog(file)
            log.newIds()
            assertEquals(41L, log.offset)
        }
    }

    @Test
    fun `reads the identifiers after a line that no read can hold`() {
        withFile { file ->
            append(file, "${tooLong()}\n$one\n$two\n")

            assertEquals(listOf(one, two), drain(DoneLog(file)))
        }
    }

    @Test
    fun `counts a line that no read can hold as one refused line`() {
        withFile { file ->
            append(file, "${tooLong()}\n$one\n")
            val log = DoneLog(file)

            drain(log)

            assertEquals(1, log.rejected)
        }
    }

    @Test
    fun `moves the read position past a line that no read can hold`() {
        withFile { file ->
            append(file, "${tooLong()}\n")
            val log = DoneLog(file)

            drain(log)

            assertEquals(Files.size(file), log.offset, "a read that never moves reads the same bytes for good")
        }
    }

    @Test
    fun `takes no identifier out of the end of a line that no read can hold`() {
        withFile { file ->
            append(file, "${tooLong()}$one\n$two\n")

            assertEquals(listOf(two), drain(DoneLog(file)))
        }
    }

    private companion object {
        /** How many reads the tests give a log. A line of two megabytes needs three. */
        const val READS = 8
    }
}
