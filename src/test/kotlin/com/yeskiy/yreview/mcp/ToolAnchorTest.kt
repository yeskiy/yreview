package com.yeskiy.yreview.mcp

import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.ReviewService
import java.io.File
import java.nio.file.Files

/** The MCP tools write to the stores of the project only. JUnit 3 finds a test by the prefix test. */
class ToolAnchorTest : BasePlatformTestCase() {

    fun testALooseFileGetsTheNoStoreError() {
        val dir = Files.createTempDirectory("y-review-tool").toFile()
        try {
            val file = LocalFileSystem.getInstance()
                .refreshAndFindFileByIoFile(File(dir, "f.txt").also { it.writeText("x\n") })!!
            val service = ReviewService.getInstance(project)
            val found = service.anchorOf(file)

            assertTrue(found is AnchorResult.Found)
            assertEquals("The project holds no review store for f.txt.", ToolAnchor.problemOf(service, found, "f.txt"))
        } finally {
            dir.deleteRecursively()
        }
    }

    fun testTheRefusalsKeepTheirTexts() {
        val service = ReviewService.getInstance(project)

        assertEquals("The repository of a.kt has no commit yet.", ToolAnchor.problemOf(service, AnchorResult.NoCommit, "a.kt"))
        assertEquals("The project holds no review store for a.kt.", ToolAnchor.problemOf(service, AnchorResult.NoPlace, "a.kt"))
        assertEquals("The project holds no review store for a.kt.", ToolAnchor.problemOf(service, AnchorResult.HomeFile, "a.kt"))
    }
}
