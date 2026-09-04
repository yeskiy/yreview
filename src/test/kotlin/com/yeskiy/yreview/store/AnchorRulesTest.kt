package com.yeskiy.yreview.store

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AnchorRulesTest {

    private val base = "E:/Projects/site"

    @Test
    fun `a file under the project directory uses the project directory`() {
        assertEquals(base, AnchorRules.folderRoot("$base/CLAUDE.md", base, listOf("$base/app")))
    }

    @Test
    fun `a deep file under the project directory still uses the project directory`() {
        assertEquals(base, AnchorRules.folderRoot("$base/docs/reviews/one.md", base, emptyList()))
    }

    @Test
    fun `a file outside the project directory uses the innermost content root`() {
        assertEquals(
            "E:/Other/lib/inner",
            AnchorRules.folderRoot("E:/Other/lib/inner/a.kt", base, listOf("E:/Other/lib", "E:/Other/lib/inner")),
        )
    }

    @Test
    fun `a file outside every root has no place`() {
        assertNull(AnchorRules.folderRoot("E:/Elsewhere/a.kt", base, listOf("$base/app")))
    }

    @Test
    fun `a null project directory falls through to the content roots`() {
        assertEquals("$base/app", AnchorRules.folderRoot("$base/app/a.kt", null, listOf("$base/app")))
    }

    @Test
    fun `a sibling folder with a longer name is not inside the root`() {
        assertNull(AnchorRules.folderRoot("E:/Projects/site-two/a.kt", base, emptyList()))
    }

    @Test
    fun `the relative path drops the root and the slash`() {
        assertEquals("docs/one.md", AnchorRules.relative("$base/docs/one.md", base))
    }

    @Test
    fun `the relative path of a file outside the root is null`() {
        assertNull(AnchorRules.relative("E:/Elsewhere/a.kt", base))
    }

    @Test
    fun `the root itself has no relative path`() {
        assertNull(AnchorRules.relative(base, base))
    }
}

class AnchorPlanTest {

    private val project = "E:/Projects/site"

    private val head = "9f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b706"

    private fun plan(
        filePath: String,
        repositoryRoot: String? = null,
        head: String? = null,
        contentRoots: List<String> = emptyList(),
    ) = AnchorRules.plan(filePath, repositoryRoot, head, { project }, { contentRoots })

    @Test
    fun `a file of a repository goes to the notes of that repository`() {
        assertEquals(
            AnchorPlan.Git("$project/api", head, "src/Main.kt"),
            plan("$project/api/src/Main.kt", repositoryRoot = "$project/api", head = head),
        )
    }

    @Test
    fun `a file of an inner repository never reaches the folder of a parent`() {
        val answer = plan(
            "$project/api/src/Main.kt",
            repositoryRoot = "$project/api",
            head = head,
            contentRoots = listOf(project, "$project/api"),
        )
        assertEquals(AnchorPlan.Git("$project/api", head, "src/Main.kt"), answer)
    }

    @Test
    fun `a repository without a commit refuses and takes no folder`() {
        val answer = plan(
            "$project/api/src/Main.kt",
            repositoryRoot = "$project/api",
            head = null,
            contentRoots = listOf(project),
        )
        assertEquals(AnchorPlan.NoCommit, answer)
    }

    @Test
    fun `a file that no repository holds goes to the folder store`() {
        assertEquals(
            AnchorPlan.Folder(project, "notes/one.md"),
            plan("$project/notes/one.md"),
        )
    }

    @Test
    fun `a file outside every root has no place`() {
        assertEquals(AnchorPlan.NoPlace, plan("E:/Elsewhere/a.kt"))
    }

    @Test
    fun `the root of a repository is not a file of that repository`() {
        assertEquals(AnchorPlan.NoPlace, plan("$project/api", repositoryRoot = "$project/api", head = head))
    }

    @Test
    fun `a repository does not read the project roots`() {
        var reads = 0
        AnchorRules.plan(
            "$project/api/src/Main.kt",
            "$project/api",
            head,
            { project },
            { reads += 1; listOf(project) },
        )
        assertEquals(0, reads, "the rule read the content roots of the project")
    }
}
