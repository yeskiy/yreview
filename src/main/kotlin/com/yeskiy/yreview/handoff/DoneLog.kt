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
 * reaches git.
 */
class DoneLog(val file: Path) {

    var offset: Long = 0
        private set

    var rejected: Int = 0
        private set

    fun newIds(): List<String> {
        if (!Files.isRegularFile(file)) return emptyList()
        val size = Files.size(file)
        if (size < offset) offset = 0
        if (size == offset) return emptyList()

        val text = String(read(minOf(size - offset, MAX_READ)), StandardCharsets.UTF_8)
        val whole = text.substringBeforeLast('\n', "")
        if (whole.isEmpty()) return emptyList()
        offset += whole.toByteArray(StandardCharsets.UTF_8).size + 1

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
