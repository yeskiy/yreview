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

private const val COMMIT = "0123456789abcdef0123456789abcdef01234567"

class CommentTextTest {

    private fun stored(
        ref: String,
        text: String,
        startLine: Int? = 88,
        commit: String = COMMIT,
    ): StoredComment {
        val comment = Comment(
            timestamp = "1787194427",
            author = "a@b.c",
            description = text,
            location = Location(
                commit = commit,
                path = "src/main/kotlin/Parser.kt",
                range = startLine?.let { Range(startLine = it, endLine = it + 6) },
            ),
        )
        return StoredComment(comment.id(), ref, commit, comment)
    }

    @Test
    fun `the header names the file and the line range`() {
        assertEquals("src/Parser.kt:12-18", CommentText.header("src/Parser.kt", 12, 18))
    }

    @Test
    fun `the header of one line holds the same number twice`() {
        assertEquals("a.kt:7-7", CommentText.header("a.kt", 7, 7))
    }

    @Test
    fun `the diff header adds the short revision`() {
        assertEquals(
            "a.kt:1-2 @0123456",
            CommentText.diffHeader("a.kt", 1, 2, "0123456789abcdef0123456789abcdef01234567", dirty = false),
        )
    }

    @Test
    fun `the diff header marks the working tree`() {
        assertEquals(
            "a.kt:1-2 @0123456 (working tree)",
            CommentText.diffHeader("a.kt", 1, 2, "0123456789abcdef0123456789abcdef01234567", dirty = true),
        )
    }

    @Test
    fun `the share tooltip of a git repository names the push`() {
        assertEquals(
            "The plugin pushes a shared comment to origin. " +
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
            CommentText.location(stored(NoteRefs.LOCAL, "x", startLine = null)),
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
}
