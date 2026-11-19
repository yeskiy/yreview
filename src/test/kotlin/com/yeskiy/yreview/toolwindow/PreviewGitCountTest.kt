package com.yeskiy.yreview.toolwindow

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.tasks.Counting
import com.yeskiy.yreview.tasks.NoteScan
import com.yeskiy.yreview.tasks.TaskScan
import kotlin.test.Test
import kotlin.test.assertEquals

class PreviewGitCountTest {

    private val line = Range(startLine = 1, endLine = 1)

    private fun book(repo: TempRepo, git: GitRunner = repo.git) =
        CommentBook(NotesGateway(git, repo.dir.path) { NoteScan.moved(repo.dir.path, it) }, author = "a@example.com")

    private fun reload(repo: TempRepo, git: GitRunner, head: String) =
        TaskScan.placedTasks(git, repo.dir.path, head, null, false, { false })

    /** The panel first scans and reads the preview, then one resolve runs, then the reload and the preview read follow. */
    @Test
    fun `a write plus the reload and the preview read with the preview on start only the git of the write`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            val shown = book(repo).add(NoteRefs.LOCAL, commit, "a.txt", line, "shown")
            NoteScan.forget()
            reload(repo, repo.git, commit)
            CommentPreviewPanel.liveIn(CommentPreviewPanel.notesIn(repo.git, repo.dir.path), shown, false)

            val write = Counting(repo.git)
            book(repo, write).resolve(shown)
            val read = Counting(repo.git)
            reload(repo, read, commit)
            val live = CommentPreviewPanel.liveIn(CommentPreviewPanel.notesIn(read, repo.dir.path), shown, false)

            assertEquals(4, write.runs.get())
            assertEquals(0, read.runs.get())
            assertEquals(emptyList<StoredComment>(), live)
            assertEquals(listOf(shown), CommentPreviewPanel.liveIn(CommentPreviewPanel.notesIn(read, repo.dir.path), shown, true))
        }
    }

    @Test
    fun `the preview read sees a resolve that git wrote outside the IDE`() {
        TempRepo().use { repo ->
            val commit = repo.commit("a.txt", "a")
            val shown = book(repo).add(NoteRefs.LOCAL, commit, "a.txt", line, "shown")
            NoteScan.forget()
            assertEquals(listOf(shown), CommentPreviewPanel.liveIn(CommentPreviewPanel.notesIn(repo.git, repo.dir.path), shown, false))

            CommentBook(NotesGateway(repo.git), author = "b@example.com").resolve(shown)

            assertEquals(emptyList<StoredComment>(), CommentPreviewPanel.liveIn(CommentPreviewPanel.notesIn(repo.git, repo.dir.path), shown, false))
        }
    }
}
