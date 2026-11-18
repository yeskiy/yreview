package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.tasks.NoteScan
import com.yeskiy.yreview.tasks.TaskScan
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PreviewRecordTest {

    /** Six commits with two comments each on LOCAL and DISCUSS, and one resolved comment per commit. */
    private fun buildComments(repo: TempRepo) {
        val book = CommentBook(NotesGateway(repo.git), author = "reviewer@example.com")
        (1..6).forEach { index ->
            val commit = repo.commit("f$index.txt", "line $index")
            listOf(NoteRefs.LOCAL, NoteRefs.DISCUSS).forEach { ref ->
                val first = book.add(ref, commit, "f$index.txt", Range(startLine = 1, endLine = 1), "first $index on $ref")
                book.add(ref, commit, "f$index.txt", Range(startLine = 1, endLine = 1), "second $index on $ref")
                if (ref == NoteRefs.LOCAL) book.resolve(first)
            }
        }
    }

    @Test
    fun `the snapshot gives the same record as the gateway for every comment row`() {
        TempRepo().use { repo ->
            buildComments(repo)
            NoteScan.forget()
            val snapshot = assertNotNull(NoteScan.read(repo.git, repo.dir.path))
            val rows = TaskScan.placedTasks(repo.git, repo.dir.path, null, null, true, { false }, notes = snapshot)
            assertTrue(rows.size >= 12, "${rows.size} rows")
            rows.forEach { task ->
                val record = CommentPreviewPanel.recordIn(NotesGateway(repo.git), task)
                assertNotNull(record, task.text)
                assertEquals(record, CommentPreviewPanel.recordIn(snapshot, task), task.text)
            }
        }
    }
}
