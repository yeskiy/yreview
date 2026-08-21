package com.yeskiy.yreview.mcp

import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ReviewPayloadsTest {

    private fun stored(ref: String, path: String = "src/a.kt", range: Range? = Range(3, endLine = 5)) =
        StoredComment(
            id = "abc123",
            ref = ref,
            comment = Comment(
                timestamp = "1755600000",
                author = "dev@example.com",
                description = "rename this",
                location = Location(commit = "deadbeef", path = path, range = range),
            ),
        )

    @Test
    fun `the shared refs are always read`() {
        assertEquals(listOf(NoteRefs.DISCUSS), ReviewArguments.refsFor(includeAnalyses = false, includeLocal = false))
    }

    @Test
    fun `each flag adds one ref`() {
        assertEquals(
            listOf(NoteRefs.DISCUSS, NoteRefs.ANALYSES, NoteRefs.LOCAL),
            ReviewArguments.refsFor(includeAnalyses = true, includeLocal = true),
        )
    }

    @Test
    fun `a row carries the path, the range, the revision and the text`() {
        val row = ReviewPayloads.rowOf(stored(NoteRefs.DISCUSS), resolved = false)
        assertEquals(
            CommentRow(
                id = "abc123",
                path = "src/a.kt",
                startLine = 3,
                endLine = 5,
                revision = "deadbeef",
                author = "dev@example.com",
                text = "rename this",
                shared = true,
                resolved = false,
            ),
            row,
        )
    }

    @Test
    fun `a local comment is not shared`() {
        assertEquals(false, ReviewPayloads.rowOf(stored(NoteRefs.LOCAL), resolved = false)?.shared)
    }

    @Test
    fun `a comment without a location has no row`() {
        val orphan = StoredComment("id", NoteRefs.LOCAL, Comment(timestamp = "1", author = "a"))
        assertNull(ReviewPayloads.rowOf(orphan, resolved = false))
    }

    @Test
    fun `a comment without a range covers the whole file`() {
        val row = ReviewPayloads.rowOf(stored(NoteRefs.DISCUSS, range = null), resolved = false)
        assertEquals(0, row?.startLine)
        assertEquals(0, row?.endLine)
    }

    @Test
    fun `the list payload names the comments field`() {
        val text = ReviewPayloads.list(listOfNotNull(ReviewPayloads.rowOf(stored(NoteRefs.DISCUSS), resolved = false)))
        assertTrue(text.startsWith("{\"comments\":["), text)
        assertTrue(text.contains("\"id\":\"abc123\""), text)
        assertTrue(text.contains("\"startLine\":3"), text)
    }

    @Test
    fun `an empty list still names the comments field`() {
        assertEquals("{\"comments\":[]}", ReviewPayloads.list(emptyList()))
    }

    @Test
    fun `the error payload holds the message`() {
        assertEquals("{\"error\":\"no such comment\"}", ReviewPayloads.error("no such comment"))
    }

    @Test
    fun `the added payload holds the new id`() {
        assertEquals(
            "{\"id\":\"abc123\",\"path\":\"src/a.kt\",\"revision\":\"deadbeef\",\"shared\":false}",
            ReviewPayloads.added(id = "abc123", path = "src/a.kt", revision = "deadbeef", shared = false),
        )
    }

    @Test
    fun `the resolved payload reports success`() {
        assertEquals("{\"id\":\"abc123\",\"resolved\":true}", ReviewPayloads.resolved("abc123"))
    }

    @Test
    fun `the opened payload names what the ide showed`() {
        assertEquals(
            "{\"id\":\"abc123\",\"opened\":\"diff\",\"path\":\"src/a.kt\",\"line\":3,\"revision\":\"deadbeef\"}",
            ReviewPayloads.opened(id = "abc123", opened = "diff", path = "src/a.kt", line = 3, revision = "deadbeef"),
        )
    }

    @Test
    fun `a plain relative path passes`() {
        assertEquals("src/main/a.kt", ReviewArguments.normalizePath("src/main/a.kt"))
    }

    @Test
    fun `a backslash becomes a forward slash`() {
        assertEquals("src/main/a.kt", ReviewArguments.normalizePath("src\\main\\a.kt"))
    }

    @Test
    fun `a leading dot segment is dropped`() {
        assertEquals("src/a.kt", ReviewArguments.normalizePath("./src/./a.kt"))
    }

    @Test
    fun `an inner parent segment is folded`() {
        assertEquals("src/a.kt", ReviewArguments.normalizePath("src/main/../a.kt"))
    }

    @Test
    fun `a path that leaves the project is rejected`() {
        assertNull(ReviewArguments.normalizePath("../secrets.txt"))
        assertNull(ReviewArguments.normalizePath("src/../../secrets.txt"))
    }

    @Test
    fun `an absolute path is rejected`() {
        assertNull(ReviewArguments.normalizePath("/etc/passwd"))
        assertNull(ReviewArguments.normalizePath("C:\\Windows\\win.ini"))
        assertNull(ReviewArguments.normalizePath("\\\\server\\share\\file"))
    }

    @Test
    fun `an empty path is rejected`() {
        assertNull(ReviewArguments.normalizePath("   "))
        assertNull(ReviewArguments.normalizePath("."))
    }

    @Test
    fun `a good range has no problem`() {
        assertNull(ReviewArguments.rangeProblem(1, 1))
        assertNull(ReviewArguments.rangeProblem(3, 9))
    }

    @Test
    fun `a line below one is a problem`() {
        assertEquals("startLine must be 1 or more.", ReviewArguments.rangeProblem(0, 4))
    }

    @Test
    fun `an end line before the start line is a problem`() {
        assertEquals("endLine must be equal to startLine or larger.", ReviewArguments.rangeProblem(7, 4))
    }

    @Test
    fun `a hexadecimal revision passes`() {
        assertTrue(ReviewArguments.isRevision("deadbee"))
        assertTrue(ReviewArguments.isRevision("4f9a1c2b3d4e5f60718293a4b5c6d7e8f9012345"))
    }

    @Test
    fun `a revision that could pass as a git option is rejected`() {
        assertFalse(ReviewArguments.isRevision("--upload-pack=calc"))
        assertFalse(ReviewArguments.isRevision("HEAD"))
        assertFalse(ReviewArguments.isRevision("dead"))
        assertFalse(ReviewArguments.isRevision(""))
    }
}
