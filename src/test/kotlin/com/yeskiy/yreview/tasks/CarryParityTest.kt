package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.TempRepo
import com.yeskiy.yreview.gutter.CommentMarks
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.store.shown
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** The editor draws the same comments of a file, at the same lines, that the tool window lists. */
class CarryParityTest {

    private data class Seen(val id: String, val start: Int, val end: Int)

    private val ten = (1..10).joinToString("") { "l$it\n" }

    @AfterTest
    fun forget() = DiffCache.forget()

    private fun TempRepo.head() = git.run("rev-parse", "HEAD").stdout.trim()

    private fun TempRepo.note(commit: String, start: Int, end: Int, text: String) =
        CommentBook(NotesGateway(git), "t@example.com").add(NoteRefs.LOCAL, commit, "sample.ts", Range(startLine = start, endLine = end), text)

    private fun TempRepo.editor(): Set<Seen> =
        CommentMarks.of(PlacedComments.of(git, dir.path, head(), "sample.ts")).byLine.values.flatten()
            .map { placed -> placed.carry.shown!!.let { Seen(placed.stored.id, it.startLine, it.endLine) } }.toSet()

    private fun TempRepo.view(): Set<Seen> =
        TaskScan.placedTasks(git, dir.path, head(), null, false, { false })
            .filter { it.path == "sample.ts" && it.carry?.kind in setOf(CarryKind.SAME, CarryKind.OUTDATED) }
            .map { Seen(it.id, it.startLine, it.endLine) }.toSet()

    private fun TempRepo.agree(count: Int) {
        assertEquals(count, editor().size)
        assertEquals(editor(), view())
    }

    private fun TempRepo.starts(): Map<String, Int> = editor().associate { it.id to it.start }

    @Test
    fun `the editor and the view agree after a commit, a checkout and an edit above`() = TempRepo().use { repo ->
        val first = repo.commit("sample.ts", ten)
        val old2 = repo.note(first, 2, 2, "Old one.").id
        val old8 = repo.note(first, 8, 9, "Old two.").id
        val second = repo.commit("sample.ts", ten.replace("l5", "x5"))
        val head3 = repo.note(second, 3, 3, "Head one.").id
        val head5 = repo.note(second, 5, 5, "Head two.").id
        repo.agree(4)
        assertEquals(mapOf(old2 to 2, old8 to 8, head3 to 3, head5 to 5), repo.starts())

        repo.commit("other.ts", "x\n")
        repo.agree(4)

        repo.git.run("checkout", "-q", "-b", "side", first)
        repo.agree(4)

        val sample = File(repo.dir, "sample.ts")
        sample.writeText("n1\nn2\n${sample.readText()}")
        repo.agree(4)
        assertEquals(mapOf(old2 to 2, old8 to 8, head3 to 5, head5 to 7), repo.starts())

        repo.git.run("commit", "-q", "-am", "edit above")
        repo.agree(4)
        assertEquals(mapOf(old2 to 4, old8 to 10, head3 to 5, head5 to 7), repo.starts())
    }
}
