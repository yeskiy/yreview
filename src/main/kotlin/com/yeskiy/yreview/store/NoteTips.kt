package com.yeskiy.yreview.store

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.util.concurrent.ConcurrentHashMap

/** The tips of refs read from the loose ref files and packed-refs. Null when the files do not give a sure answer. */
object NoteTips {

    private data class Packed(val size: Long, val time: FileTime, val tips: Map<String, String>?)

    private val packed = ConcurrentHashMap<Path, Packed>()

    private val OBJECT_ID = Regex("^[0-9a-f]{40}([0-9a-f]{24})?$")

    /** The tip of each ref that exists, in the order of [refs]. Only java.nio reads, so a rename of git never fails. */
    fun read(common: Path, refs: List<String>): Map<String, String>? = runCatching {
        val fromPack by lazy { packedOf(common) }
        refs.mapNotNull { ref ->
            val loose = common.resolve(ref)
            val tip = if (Files.isRegularFile(loose)) {
                Files.readString(loose).trim().takeIf { OBJECT_ID.matches(it) } ?: return null
            } else {
                (fromPack ?: return null)[ref]
            }
            tip?.let { ref to it }
        }.toMap()
    }.getOrNull()

    /** The refs of packed-refs. A peeled line starts with "^" and names no ref. */
    private fun packedOf(common: Path): Map<String, String>? {
        val file = common.resolve("packed-refs")
        if (!Files.exists(file)) return emptyMap()
        val size = Files.size(file)
        val time = Files.getLastModifiedTime(file)
        packed[common]?.takeIf { it.size == size && it.time == time }?.let { return it.tips }
        val tips = Files.readAllLines(file).filter { it.isNotBlank() && !it.startsWith("#") && !it.startsWith("^") }
            .map { it.split(' ', limit = 2) }
            .takeIf { lines -> lines.all { it.size == 2 && OBJECT_ID.matches(it[0]) } }
            ?.associate { it[1].trim() to it[0] }
        packed[common] = Packed(size, time, tips)
        return tips
    }
}
