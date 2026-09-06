package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The relay between the value the store holds and the short handle an agent reads.
 *
 * No test asserts a literal handle. The library that writes the text is free to change it.
 * The rules of the relay are the derivation, the round trip, and the match.
 *
 * No test draws a random identifier either. Two random 32 bit keys collide about once in
 * every 86 runs at ten thousand values, and a test that fails once in 86 runs is worse than
 * no test. Every test below builds its keys by counting, so the outcome never changes.
 */
class TaskHandlesTest {

    private val one = "c3f9a12aabbccddeeff00112233445566778899a"
    private val two = "0123456789abcdef0123456789abcdef01234567"
    private val todo = "todo-0123456789abcdef0123456789abcdef01234567-88"
    private val otherLine = "todo-0123456789abcdef0123456789abcdef01234567-91"

    @Test
    fun `a handle is the same for the same identifier every time`() {
        val first = TaskHandles.of(one)
        TaskHandles.of(two)
        TaskHandles.of(todo)

        assertEquals(first, TaskHandles.of(one))
    }

    @Test
    fun `ten thousand identifiers with different keys give ten thousand handles`() {
        val handles = (0 until 10_000).map { step -> TaskHandles.of("%08x".format(step) + "0".repeat(32)) }

        assertEquals(10_000, handles.toSet().size)
    }

    @Test
    fun `every handle of ten thousand identifiers passes the rules`() {
        (0 until 10_000).forEach { step ->
            val handle = TaskHandles.of("%08x".format(step) + "0".repeat(32))
            assertTrue(TaskIds.isHandle(handle), handle)
            assertTrue(TaskIds.isSafe(handle), handle)
            assertFalse(TaskIds.isLong(handle), handle)
        }
    }

    @Test
    fun `two identifiers that share the first eight characters share a handle`() {
        val first = "c3f9a12a" + "0".repeat(32)
        val second = "c3f9a12a" + "f".repeat(32)

        assertEquals(TaskHandles.of(first), TaskHandles.of(second))
    }

    @Test
    fun `a comment handle reads back as the key of that comment`() {
        val key = TaskHandles.keyOf(TaskHandles.of(one))

        assertIs<HandleKey.CommentPrefix>(key)
        assertEquals("c3f9a12a", key.prefix)
    }

    @Test
    fun `a todo handle carries its line back`() {
        val key = TaskHandles.keyOf(TaskHandles.of(todo))

        assertIs<HandleKey.TodoPrefix>(key)
        assertEquals("01234567", key.prefix)
        assertEquals(88, key.line)
    }

    @Test
    fun `a todo of another line gives another handle`() {
        assertNotEquals(TaskHandles.of(todo), TaskHandles.of(otherLine))
    }

    @Test
    fun `a todo handle is never as short as a comment handle of the same key`() {
        assertTrue(TaskHandles.of(todo).length > TaskHandles.of(two).length)
    }

    @Test
    fun `a handle of the longest line still fits the rule`() {
        val handle = TaskHandles.of("todo-${"f".repeat(40)}-9999999")

        assertTrue(TaskIds.isHandle(handle), handle)
        assertTrue(handle.length <= 15, "the longest handle held ${handle.length} characters: $handle")
    }

    @Test
    fun `a long identifier reads back as itself`() {
        assertEquals(HandleKey.Exact(one), TaskHandles.keyOf(one))
        assertEquals(HandleKey.Exact(todo), TaskHandles.keyOf(todo))
    }

    @Test
    fun `a value that is neither gives no key`() {
        assertNull(TaskHandles.keyOf("../../etc/passwd"))
        assertNull(TaskHandles.keyOf("--exec=calc.exe"))
        assertNull(TaskHandles.keyOf(""))
    }

    @Test
    fun `a handle finds the identifier it stands for`() {
        val key = TaskHandles.keyOf(TaskHandles.of(one))!!

        assertEquals(HandleMatch.One(one), TaskHandles.match(key, listOf(two, one)))
    }

    @Test
    fun `a long identifier finds itself`() {
        assertEquals(HandleMatch.One(one), TaskHandles.match(HandleKey.Exact(one), listOf(two, one)))
    }

    @Test
    fun `a handle that names no task finds nothing`() {
        val key = TaskHandles.keyOf(TaskHandles.of(one))!!

        assertEquals(HandleMatch.None, TaskHandles.match(key, listOf(two)))
    }

    @Test
    fun `a handle that names two tasks reports the count`() {
        val first = "c3f9a12a" + "0".repeat(32)
        val second = "c3f9a12a" + "f".repeat(32)
        val key = TaskHandles.keyOf(TaskHandles.of(first))!!

        assertEquals(HandleMatch.Many(2), TaskHandles.match(key, listOf(first, second, two)))
    }

    @Test
    fun `a todo handle finds only the line it names`() {
        val key = TaskHandles.keyOf(TaskHandles.of(todo))!!

        assertEquals(HandleMatch.One(todo), TaskHandles.match(key, listOf(otherLine, todo)))
    }

    @Test
    fun `a todo handle never finds a comment`() {
        val key = TaskHandles.keyOf(TaskHandles.of(todo))!!

        assertEquals(HandleMatch.None, TaskHandles.match(key, listOf(two)))
    }

    @Test
    fun `a comment handle never finds a todo`() {
        val key = TaskHandles.keyOf(TaskHandles.of(two))!!

        assertEquals(HandleMatch.None, TaskHandles.match(key, listOf(todo)))
    }

    @Test
    fun `tells a todo value from a comment value in both forms`() {
        assertTrue(TaskHandles.namesTodo(todo))
        assertTrue(TaskHandles.namesTodo(TaskHandles.of(todo)))
        assertFalse(TaskHandles.namesTodo(one))
        assertFalse(TaskHandles.namesTodo(TaskHandles.of(one)))
        assertFalse(TaskHandles.namesTodo("../../etc/passwd"))
    }

    @Test
    fun `turns the identifier of every task into a handle`() {
        val task = ReviewTask(
            id = one,
            kind = TaskKind.COMMENT,
            path = "src/A.kt",
            startLine = 1,
            endLine = 2,
            text = "rename this",
            filePath = "E:/repo/src/A.kt",
            rootPath = "E:/repo",
        )

        val outward = TaskHandles.outward(listOf(task))

        assertEquals(TaskHandles.of(one), outward.first().id)
        assertEquals("E:/repo", outward.first().rootPath)
        assertEquals("src/A.kt", outward.first().path)
    }

    @Test
    fun `a handle of a real record finds that record`() {
        TempRepo().use { repo ->
            val book = CommentBook(NotesGateway(repo.git), author = "reviewer@example.com")
            val head = repo.commit("a.kt", "one")
            val stored = book.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "one")

            val key = TaskHandles.keyOf(TaskHandles.of(stored.id))!!

            assertEquals(HandleMatch.One(stored.id), TaskHandles.match(key, book.tasks().map { it.id }))
        }
    }

    @Test
    fun `a long identifier of a real record still finds that record`() {
        TempRepo().use { repo ->
            val book = CommentBook(NotesGateway(repo.git), author = "reviewer@example.com")
            val head = repo.commit("a.kt", "one")
            val stored = book.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "one")

            val key = TaskHandles.keyOf(stored.id)!!

            assertEquals(HandleMatch.One(stored.id), TaskHandles.match(key, book.tasks().map { it.id }))
        }
    }

    @Test
    fun `a handle of a record that went away finds nothing`() {
        TempRepo().use { repo ->
            val book = CommentBook(NotesGateway(repo.git), author = "reviewer@example.com")
            val head = repo.commit("a.kt", "one")
            val stored = book.add(NoteRefs.LOCAL, head, "a.kt", Range(startLine = 1, endLine = 1), "one")
            val handle = TaskHandles.of(stored.id)
            book.remove(listOf(stored))

            val key = TaskHandles.keyOf(handle)!!

            assertEquals(HandleMatch.None, TaskHandles.match(key, book.tasks().map { it.id }))
        }
    }

    @Test
    fun `a second pass over the same list changes nothing`() {
        val task = ReviewTask(
            id = one,
            kind = TaskKind.COMMENT,
            path = "src/A.kt",
            startLine = 1,
            endLine = 2,
            text = "rename this",
        )
        val once = TaskHandles.outward(listOf(task))

        assertEquals(once, TaskHandles.outward(once))
    }
}
