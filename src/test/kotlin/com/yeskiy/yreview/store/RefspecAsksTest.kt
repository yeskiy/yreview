package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The plugin asks once for each repository, and never again after "Do not ask again". */
class RefspecAsksTest {

    @Test
    fun `the first share of a session asks, and later shares stay quiet`() {
        val asks = RefspecAsks()

        assertTrue(asks.mayAsk(ROOT))
        assertFalse(asks.mayAsk(ROOT), "a question that is open or closed in this session does not come back")
        assertTrue(asks.mayAsk(OTHER), "each repository gets its own question")
    }

    @Test
    fun `do not ask again stops later questions, also in a new session`() {
        val asks = RefspecAsks()
        asks.decline(ROOT)

        assertFalse(asks.mayAsk(ROOT))
        val next = RefspecAsks(asks.declined())
        assertFalse(next.mayAsk(ROOT), "the answer is kept in the project state")
        assertTrue(next.mayAsk(OTHER))
        assertEquals(listOf(ROOT), next.declined())
    }

    private companion object {
        const val ROOT = "/work/one"
        const val OTHER = "/work/two"
    }
}
