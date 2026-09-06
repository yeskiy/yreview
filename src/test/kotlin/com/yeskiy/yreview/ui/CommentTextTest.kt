package com.yeskiy.yreview.ui

import com.yeskiy.yreview.store.Comment
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.Location
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.id
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val COMMIT = "0123456789abcdef0123456789abcdef01234567"

class CommentTextTest {

    private fun stored(
        ref: String,
        text: String,
        range: Range? = Range(startLine = 88, endLine = 94),
        commit: String = COMMIT,
        author: String = "a@b.c",
        path: String = "src/main/kotlin/Parser.kt",
    ): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = author,
            description = text,
            location = Location(commit = commit, path = path, range = range),
        )
        return StoredComment(comment.id(), ref, commit, comment)
    }

    @Test
    fun `the header names the file and the line range`() {
        assertEquals(
            "src/Parser.kt:12-18",
            CommentText.header("src/Parser.kt", Range(startLine = 12, endLine = 18)),
        )
    }

    @Test
    fun `the header of one line holds the same number twice`() {
        assertEquals("a.kt:7-7", CommentText.header("a.kt", Range(startLine = 7, endLine = 7)))
    }

    @Test
    fun `the header names the characters of a part of a line`() {
        assertEquals(
            "src/Parser.kt:88:4-94:9",
            CommentText.header("src/Parser.kt", Range(startLine = 88, startColumn = 4, endLine = 94, endColumn = 9)),
        )
    }

    @Test
    fun `the diff header adds the short revision`() {
        assertEquals(
            "a.kt:1-2 @0123456",
            CommentText.diffHeader(
                "a.kt",
                Range(startLine = 1, endLine = 2),
                "0123456789abcdef0123456789abcdef01234567",
                dirty = false,
            ),
        )
    }

    @Test
    fun `the diff header names the characters of a part of a line`() {
        assertEquals(
            "a.kt:1:4-2:9 @0123456",
            CommentText.diffHeader(
                "a.kt",
                Range(startLine = 1, startColumn = 4, endLine = 2, endColumn = 9),
                "0123456789abcdef0123456789abcdef01234567",
                dirty = false,
            ),
        )
    }

    @Test
    fun `the diff header marks the working tree`() {
        assertEquals(
            "a.kt:1-2 @0123456 (working tree)",
            CommentText.diffHeader(
                "a.kt",
                Range(startLine = 1, endLine = 2),
                "0123456789abcdef0123456789abcdef01234567",
                dirty = true,
            ),
        )
    }

    @Test
    fun `the share tooltip of a git repository names the push`() {
        assertEquals(
            "The plugin pushes a shared comment to the remote that the settings name. " +
                "A comment that you do not share stays in this repository.",
            CommentText.shareTooltip(canPush = true),
        )
    }

    @Test
    fun `the share tooltip of a folder store says that the push waits`() {
        assertEquals(
            "No git repository covers this file, so the plugin cannot push yet. " +
                "A shared comment reaches the remote after the comments move into the git notes.",
            CommentText.shareTooltip(canPush = false),
        )
    }

    @Test
    fun `an empty text is not a comment`() {
        assertEquals(CommentText.EMPTY_MESSAGE, CommentText.errorOf(""))
    }

    @Test
    fun `a text of spaces and line breaks is not a comment`() {
        assertEquals(CommentText.EMPTY_MESSAGE, CommentText.errorOf("  \n\t "))
    }

    @Test
    fun `a text with one word is a comment`() {
        assertNull(CommentText.errorOf("fix"))
    }

    @Test
    fun `the location shows the range and the short revision`() {
        assertEquals("src/main/kotlin/Parser.kt:88-94 @0123456", CommentText.location(stored(NoteRefs.LOCAL, "x")))
    }

    @Test
    fun `the location of a comment without a range shows the path`() {
        assertEquals(
            "src/main/kotlin/Parser.kt @0123456",
            CommentText.location(stored(NoteRefs.LOCAL, "x", range = null)),
        )
    }

    @Test
    fun `a worktree anchor reads as working tree`() {
        assertEquals(
            "src/main/kotlin/Parser.kt:88-94 @working tree",
            CommentText.location(stored(NoteRefs.LOCAL, "x", commit = FolderStore.WORKTREE)),
        )
    }

    @Test
    fun `the signature names the author and the local ref`() {
        assertEquals("a@b.c, local", CommentText.signature(stored(NoteRefs.LOCAL, "x")))
    }

    @Test
    fun `the signature names the author and the shared ref`() {
        assertEquals("a@b.c, shared", CommentText.signature(stored(NoteRefs.DISCUSS, "x")))
    }

    @Test
    fun `the summary keeps only the first line of the text`() {
        assertEquals("88-94: first line", CommentText.summary(stored(NoteRefs.LOCAL, "first line\nsecond line")))
    }

    @Test
    fun `the summary names the characters of a part of a line`() {
        assertEquals(
            "88:4-94:9: first line",
            CommentText.summary(
                stored(
                    NoteRefs.LOCAL,
                    "first line\nsecond line",
                    Range(startLine = 88, startColumn = 4, endLine = 94, endColumn = 9),
                ),
            ),
        )
    }

    @Test
    fun `an author that starts with the markup tag reads as unknown`() {
        assertEquals(
            "unknown, local",
            CommentText.signature(stored(NoteRefs.LOCAL, "x", author = "<html><b>alice")),
        )
    }

    @Test
    fun `a path that starts with the markup tag reads as unknown`() {
        assertEquals(
            "unknown:88-94 @0123456",
            CommentText.location(stored(NoteRefs.LOCAL, "x", path = "<html><img src=x>")),
        )
    }

    @Test
    fun `a path without a range that starts with the markup tag reads as unknown`() {
        assertEquals(
            "unknown @0123456",
            CommentText.location(
                stored(NoteRefs.LOCAL, "x", range = null, path = "<html><img src=x>"),
            ),
        )
    }

    @Test
    fun `a header cuts a path that is longer than the cap`() {
        val header = CommentText.header("y".repeat(400), Range(startLine = 1, endLine = 2))

        assertTrue(header.startsWith("y".repeat(200) + "..."), header)
    }
}
