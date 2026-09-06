package com.yeskiy.yreview.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ResolveRequestTest {

    private val one = "c3f9a12aabbccddeeff00112233445566778899a"
    private val two = "0123456789abcdef0123456789abcdef01234567"

    private fun ids(body: String): List<String> {
        val parsed = ResolveRequest.parse(body)
        assertIs<ResolveParse.Ids>(parsed)
        return parsed.ids
    }

    private fun reason(body: String): String {
        val parsed = ResolveRequest.parse(body)
        assertIs<ResolveParse.Bad>(parsed)
        return parsed.reason
    }

    @Test
    fun `reads a short handle`() {
        assertEquals(listOf("yd8pmsq91"), ids("""{"ids":["yd8pmsq91"]}"""))
    }

    @Test
    fun `reads a handle beside an identifier of an older build`() {
        assertEquals(listOf("yd8pmsq91", one), ids("""{"ids":["yd8pmsq91","$one"]}"""))
    }

    @Test
    fun `refuses a short value that carries no prefix`() {
        assertTrue(reason("""{"ids":["d8pmsq91"]}""").isNotEmpty())
    }

    @Test
    fun `names the handle form in the reason`() {
        assertTrue(reason("""{"ids":["../../etc/passwd"]}""").contains("handle"))
    }

    @Test
    fun `reads one id`() {
        assertEquals(listOf(one), ids("""{"ids":["$one"]}"""))
    }

    @Test
    fun `reads several ids`() {
        assertEquals(listOf(one, two), ids("""{"ids":["$one","$two"]}"""))
    }

    @Test
    fun `keeps one copy of a repeated id`() {
        assertEquals(listOf(one), ids("""{"ids":["$one","$one"]}"""))
    }

    @Test
    fun `refuses a body that is not JSON`() {
        assertTrue(reason("not json").isNotEmpty())
    }

    @Test
    fun `refuses a body that is not an object`() {
        assertTrue(reason("""["$one"]""").isNotEmpty())
    }

    @Test
    fun `refuses a body without the ids field`() {
        assertTrue(reason("""{"comments":["$one"]}""").isNotEmpty())
    }

    @Test
    fun `refuses a field the contract does not name`() {
        assertTrue(reason("""{"ids":["$one"],"force":true}""").isNotEmpty())
    }

    @Test
    fun `refuses an empty list`() {
        assertTrue(reason("""{"ids":[]}""").isNotEmpty())
    }

    @Test
    fun `refuses more ids than the contract allows`() {
        val many = (1..201).joinToString(",") { """"$one"""" }
        assertTrue(reason("""{"ids":[$many]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id that is not a string`() {
        assertTrue(reason("""{"ids":[7]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id that is too short`() {
        assertTrue(reason("""{"ids":["c3f9a12"]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id that holds a character outside hexadecimal`() {
        assertTrue(reason("""{"ids":["c3f9a12aabbccddeeff00112233445566778899z"]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id in upper case`() {
        assertTrue(reason("""{"ids":["${one.uppercase()}"]}""").isNotEmpty())
    }

    @Test
    fun `reads the identifier of a todo task`() {
        val todo = "todo-0123456789abcdef0123456789abcdef01234567-88"
        assertEquals(listOf(todo), ids("""{"ids":["$todo"]}"""))
    }

    @Test
    fun `refuses a todo identifier without a line number`() {
        assertTrue(reason("""{"ids":["todo-0123456789abcdef0123456789abcdef01234567"]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id that starts with a hyphen`() {
        assertTrue(reason("""{"ids":["--upload-pack"]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id that holds a git argument`() {
        assertTrue(reason("""{"ids":["--exec=calc.exe"]}""").isNotEmpty())
    }

    @Test
    fun `refuses an id that holds a path`() {
        assertTrue(reason("""{"ids":["../../etc/passwd"]}""").isNotEmpty())
    }
}
