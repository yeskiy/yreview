package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.TaskIds
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

/**
 * Reads the identifiers an agent appends to done.txt.
 *
 * The reader keeps a read position, so a second read costs nothing and no line arrives
 * twice. The plugin never deletes the file. A file that became shorter lost its history,
 * so the reader starts again from the top.
 *
 * An agent outside the IDE writes this file, so every line is input the plugin does not
 * trust. A line that is not an identifier of the plugin goes to [rejected] and never
 * reaches git. A line that is longer than one read goes there too, and the reader passes it.
 */
class DoneLog(val file: Path) {

    var offset: Long = 0
        private set

    var rejected: Int = 0
        private set

    /** True while the reader stands inside a line that filled a whole read. */
    private var passing = false

    fun newIds(): List<String> {
        if (!Files.isRegularFile(file)) return emptyList()
        val size = Files.size(file)
        if (size < offset) restart()
        if (size == offset) return emptyList()

        val bytes = read(minOf(size - offset, MAX_READ))
        val text = String(bytes, StandardCharsets.UTF_8)
        val end = text.lastIndexOf('\n')
        if (end < 0) return passWindow(bytes.size)
        val whole = text.substring(0, end)
        offset += whole.toByteArray(StandardCharsets.UTF_8).size + 1
        return keep(if (passing) whole.substringAfter('\n', "") else whole)
    }

    private fun restart() {
        offset = 0
        passing = false
    }

    /**
     * Moves the read position over a window that holds no line end.
     *
     * A window that the file did not fill holds a line the agent still writes, so the reader
     * waits for the rest of it. A full window holds a line that is longer than one read. The
     * reader counts that line once and passes every window until the line ends.
     */
    private fun passWindow(bytes: Int): List<String> {
        if (bytes.toLong() < MAX_READ) return emptyList()
        offset += bytes
        if (!passing) rejected += 1
        passing = true
        return emptyList()
    }

    /** The identifiers of these lines. The reader is at a line end again, so nothing is open. */
    private fun keep(whole: String): List<String> {
        passing = false
        val lines = whole.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        rejected += lines.count { !TaskIds.isKnown(it) }
        return lines.filter { TaskIds.isKnown(it) }
    }

    private fun read(count: Long): ByteArray =
        Files.newByteChannel(file).use { channel ->
            channel.position(offset)
            val buffer = ByteBuffer.allocate(count.toInt())
            do {
                val step = channel.read(buffer)
            } while (step > 0 && buffer.hasRemaining())
            buffer.array().copyOf(buffer.position())
        }

    companion object {
        /** One read never takes more than this. The rest of the file waits for the next read. */
        const val MAX_READ = 1L shl 20
    }
}
