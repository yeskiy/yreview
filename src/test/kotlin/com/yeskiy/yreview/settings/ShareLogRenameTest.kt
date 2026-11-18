package com.yeskiy.yreview.settings

import com.intellij.util.xmlb.XmlSerializer
import com.yeskiy.yreview.tasks.TaskHandles
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShareLogRenameTest {

    private val a = "a".repeat(40)

    private val b = "b".repeat(40)

    private val c = "c".repeat(40)

    @Test
    fun `a rename moves a mark to the new identifier and root`() {
        val log = ShareLog()
        log.markUnshared(a, "/old", "refs/notes/devtools/discuss")

        log.rename(mapOf(a to b), "/r")

        assertFalse(log.isUnshared(a))
        assertTrue(log.isUnshared(b))
        assertEquals("/r", log.getState().marks.single().root)
    }

    @Test
    fun `an old identifier and its handle give the new identifier`() {
        val log = ShareLog()

        log.rename(mapOf(a to b), "/r")

        assertEquals(b, log.forward(a))
        assertEquals(b, log.forward(TaskHandles.of(a)))
        assertEquals(c, log.forward(c))
        assertEquals(TaskHandles.of(c), log.forward(TaskHandles.of(c)))
    }

    @Test
    fun `the renames survive a write and a read of the state`() {
        val log = ShareLog()
        log.rename(mapOf(a to b), "/r")

        val read = ShareLog()
        read.loadState(XmlSerializer.deserialize(XmlSerializer.serialize(log.getState()), ShareLog.State::class.java))

        assertEquals(b, read.forward(a))
    }

    @Test
    fun `the log keeps the newest 5000 renames`() {
        val log = ShareLog()
        val ids = (0 until 5_001).map { "%040x".format(it) }

        log.rename(ids.associateWith { "f" + it.drop(1) }, "/r")

        assertEquals(5_000, log.getState().renames.size)
        assertEquals(ids.first(), log.forward(ids.first()))
        assertEquals("f" + ids.last().drop(1), log.getState().renames.last().to)
    }
}
