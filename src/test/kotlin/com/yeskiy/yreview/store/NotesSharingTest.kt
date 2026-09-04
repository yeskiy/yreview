package com.yeskiy.yreview.store

import com.yeskiy.yreview.TempRepo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NotesSharingTest {

    private val note = """{"timestamp":"1787194427","author":"a@b.c"}"""

    private fun fetchRefspecs(repo: TempRepo): List<String> =
        repo.git.run("config", "--get-all", "remote.origin.fetch")
            .stdout.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()

    @Test
    fun `pushes the shared ref to the remote`() {
        TempRepo().use { repo ->
            val remote = repo.addRemote()
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, """{"timestamp":"1787194427","author":"a@b.c"}""")

            val result = NotesSharing(repo.git).share(NoteRefs.DISCUSS)

            assertTrue(result.ok, result.message)
            assertTrue(ProcessGitRunner(remote).run("rev-parse", NoteRefs.DISCUSS).ok)
        }
    }

    @Test
    fun `adds the fetch refspec once`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, """{"timestamp":"1787194427","author":"a@b.c"}""")

            NotesSharing(repo.git).share(NoteRefs.DISCUSS)
            NotesSharing(repo.git).share(NoteRefs.DISCUSS)

            assertEquals(1, fetchRefspecs(repo).count { it == NotesSharing.FETCH_REFSPEC })
        }
    }

    @Test
    fun `keeps the branch refspec the remote already had`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, """{"timestamp":"1787194427","author":"a@b.c"}""")

            NotesSharing(repo.git).share(NoteRefs.DISCUSS)

            assertTrue(fetchRefspecs(repo).any { it.startsWith("+refs/heads/") })
        }
    }

    @Test
    fun `reports the failure and keeps the note when the remote is not there`() {
        TempRepo().use { repo ->
            val missing = "${repo.dir.absolutePath.replace('\\', '/')}/no-such-remote"
            check(repo.git.run("remote", "add", "origin", missing).ok)
            val head = repo.commit("a.kt", "one")
            val line = """{"timestamp":"1787194427","author":"a@b.c"}"""
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, line)

            val result = NotesSharing(repo.git).share(NoteRefs.DISCUSS)

            assertFalse(result.ok)
            assertTrue(result.message.isNotBlank())
            assertEquals(line, NotesGateway(repo.git).readLines(NoteRefs.DISCUSS, head).single())
        }
    }

    @Test
    fun `pushes to the remote that the settings name`() {
        TempRepo().use { repo ->
            val remote = repo.addRemote("upstream")
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, note)

            val result = NotesSharing(repo.git, remote = "upstream").share(NoteRefs.DISCUSS)

            assertTrue(result.ok, result.message)
            assertTrue(ProcessGitRunner(remote).run("rev-parse", NoteRefs.DISCUSS).ok, "not every remote is origin")
        }
    }

    @Test
    fun `a closed refspec switch writes no git configuration`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, note)

            val result = NotesSharing(repo.git, writeRefspec = false).share(NoteRefs.DISCUSS)

            assertTrue(result.ok, result.message)
            assertTrue(
                fetchRefspecs(repo).none { it == NotesSharing.FETCH_REFSPEC },
                "the user owns the git configuration file"
            )
        }
    }

    @Test
    fun `reports the failure when the repository has no remote`() {
        TempRepo().use { repo ->
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, """{"timestamp":"1787194427","author":"a@b.c"}""")

            val result = NotesSharing(repo.git).share(NoteRefs.DISCUSS)

            assertFalse(result.ok)
            assertTrue(result.message.isNotBlank())
        }
    }
}
