package com.yeskiy.yreview.channel

import kotlin.test.Test
import kotlin.test.assertEquals

class FormatTest {

    private val commit = "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6"

    private fun batchOf(comments: List<ReviewComment>, commit: String = this.commit) = ReviewBatch(
        batchId = "b7f2a91",
        branch = "feat/channel-server",
        commit = commit,
        comments = comments,
    )

    private fun commentOf(
        id: String = "c3f9a12aabbccddeeff00112233445566778899a",
        path: String = "src/main/kotlin/Parser.kt",
        startLine: Int = 88,
        startColumn: Int? = null,
        endLine: Int = 94,
        endColumn: Int? = null,
        revision: String = "HEAD",
        side: Side? = null,
        text: String = "This branch never runs when the input is empty. Add the guard before the loop.",
    ) = ReviewComment(id, path, startLine, startColumn, endLine, endColumn, revision, side, text)

    @Test
    fun `names the characters of a part of a line`() {
        assertEquals(
            "[c3f9a12] a.kt:88:4-94:9 @HEAD\ntext",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(path = "a.kt", startColumn = 4, endColumn = 9, text = "text"),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `puts the short id, the path, the range, and the revision on the first line`() {
        assertEquals(
            "[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n" +
                "This branch never runs when the input is empty. Add the guard before the loop.",
            Format.batchContent(batchOf(listOf(commentOf()))),
        )
    }

    @Test
    fun `renders the revision as HEAD when it equals the batch commit`() {
        assertEquals(
            "[c3f9a12] a.kt:1-1 @HEAD\ntext",
            Format.batchContent(
                batchOf(listOf(commentOf(path = "a.kt", startLine = 1, endLine = 1, revision = commit, text = "text"))),
            ),
        )
    }

    @Test
    fun `renders a short revision for an older commit`() {
        assertEquals(
            "[a7710de] src/main/kotlin/Lexer.kt:12-12 @4f2c8b1\n" +
                "This was already wrong before the change. Fix it in the same pass.",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(
                            id = "a7710de0011223344556677889900aabbccddeef",
                            path = "src/main/kotlin/Lexer.kt",
                            startLine = 12,
                            endLine = 12,
                            revision = "4f2c8b10000000000000000000000000000000ff",
                            text = "This was already wrong before the change. Fix it in the same pass.",
                        ),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `marks a comment taken from the left side of the diff`() {
        assertEquals(
            "[a7710de] src/main/kotlin/Lexer.kt:12-12 @4f2c8b1 (left side of the diff)\n" +
                "This was already wrong before the change. Fix it in the same pass.",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(
                            id = "a7710de0011223344556677889900aabbccddeef",
                            path = "src/main/kotlin/Lexer.kt",
                            startLine = 12,
                            endLine = 12,
                            revision = "4f2c8b10000000000000000000000000000000ff",
                            side = Side.LEFT,
                            text = "This was already wrong before the change. Fix it in the same pass.",
                        ),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `does not mark a comment taken from the right side of the diff`() {
        assertEquals(
            "[a7710de] a.kt:3-3 @HEAD\ntext",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(
                            id = "a7710de0011223344556677889900aabbccddeef",
                            path = "a.kt",
                            startLine = 3,
                            endLine = 3,
                            side = Side.RIGHT,
                            text = "text",
                        ),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `separates two entries with one blank line`() {
        assertEquals(
            "[aaaaaaa] a.kt:1-2 @HEAD\nfirst\n\n[bbbbbbb] b.kt:3-4 @HEAD\nsecond",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(id = "aaaaaaa1", path = "a.kt", startLine = 1, endLine = 2, text = "first"),
                        commentOf(id = "bbbbbbb2", path = "b.kt", startLine = 3, endLine = 4, text = "second"),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `keeps a comment text that spans several lines`() {
        assertEquals(
            "[aaaaaaa] a.kt:1-1 @HEAD\nfirst line\nsecond line",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(
                            id = "aaaaaaa1",
                            path = "a.kt",
                            startLine = 1,
                            endLine = 1,
                            text = "first line\nsecond line",
                        ),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `removes leading and trailing blank space from the comment text`() {
        assertEquals(
            "[aaaaaaa] a.kt:1-1 @HEAD\npadded",
            Format.batchContent(
                batchOf(
                    listOf(
                        commentOf(id = "aaaaaaa1", path = "a.kt", startLine = 1, endLine = 1, text = "\n  padded  \n\n"),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `returns an empty string for a batch with no comments`() {
        assertEquals("", Format.batchContent(batchOf(emptyList())))
    }
}
