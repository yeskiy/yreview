package com.yeskiy.yreview.action

import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import java.io.File
import java.nio.file.Files

/** A folder store has no remote, so a shared comment goes to its local ref. JUnit 3 finds a test by the prefix test. */
class FolderShareTest : BasePlatformTestCase() {

    fun testASharedCommentOnAFolderStoreGoesToTheLocalRef() {
        val dir = Files.createTempDirectory("y-review-share").toFile()
        try {
            val file = LocalFileSystem.getInstance()
                .refreshAndFindFileByIoFile(File(dir, "f.txt").also { it.writeText("x\n") })!!
            val service = ReviewService.getInstance(project)
            val anchor = (service.anchorOf(file) as AnchorResult.Found).anchor
            assertEquals(StoreKind.FOLDER, anchor.kind)

            assertTrue(CommentWriter.write(project, anchor, Target(anchor.path, Range(1, 0, 1, 0)), "x", share = true))

            val stored = service.bookFor(anchor).list(anchor.key)
            assertEquals(listOf(NoteRefs.refFor(false)), stored.map { it.ref })
        } finally {
            dir.deleteRecursively()
        }
    }
}
