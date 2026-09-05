package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GitValuePatternTest {

    private val end = "${'$'}"

    @Test
    fun `a plain value stands between the two anchors`() {
        assertEquals("^origin" + end, GitValuePattern.exactly("origin"))
    }

    @Test
    fun `the plus and the star lose their pattern meaning`() {
        assertEquals(
            "^\\+refs/notes/devtools/\\*:refs/notes/devtools/\\*" + end,
            GitValuePattern.exactly(NotesSharing.FORCED_REFSPEC),
        )
    }

    @Test
    fun `the pattern of the forced refspec matches that refspec alone`() {
        val pattern = Regex(GitValuePattern.exactly(NotesSharing.FORCED_REFSPEC))
        assertTrue(pattern.matches(NotesSharing.FORCED_REFSPEC))
        assertFalse(pattern.matches(NotesSharing.FETCH_REFSPEC), "the safe refspec must stay")
        assertFalse(pattern.matches("+refs/heads/*:refs/remotes/origin/*"), "the branch refspec must stay")
    }
}
