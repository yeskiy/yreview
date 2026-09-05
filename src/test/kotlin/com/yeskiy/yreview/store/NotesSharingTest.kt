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
    /**
     * A note that no push carried lives in the local ref alone. The plugin writes the fetch
     * refspec into the git configuration of the user, so the next ordinary fetch of that
     * user decides whether the note stays. This test runs that fetch.
     *
     * The remote ref and the local ref hold one commit that the other does not, which is
     * the shape that a push by another person makes. [FIRST] names the commit that both
     * sides share, and the local ref goes back to it before the last note.
     */
    @Test
    fun `an ordinary fetch keeps a note that no push carried`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            val gateway = NotesGateway(repo.git)
            val shared = diverge(repo, gateway, head)

            val fetched = repo.git.run("fetch", "origin")

            assertFalse(fetched.ok, "git must refuse a fetch that is not a fast forward")
            assertEquals(listOf(shared, MINE), gateway.readLines(NoteRefs.DISCUSS, head))
        }
    }

    @Test
    fun `an ordinary fetch still brings the notes that the remote holds`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            val gateway = NotesGateway(repo.git)
            gateway.append(NoteRefs.DISCUSS, head, note)
            assertTrue(NotesSharing(repo.git).share(NoteRefs.DISCUSS).ok)
            val first = repo.git.run("rev-parse", NoteRefs.DISCUSS).stdout.trim()
            gateway.append(NoteRefs.DISCUSS, head, THEIRS)
            assertTrue(NotesSharing(repo.git).share(NoteRefs.DISCUSS).ok)
            check(repo.git.run("update-ref", NoteRefs.DISCUSS, first).ok)

            val fetched = repo.git.run("fetch", "origin")

            assertTrue(fetched.ok, fetched.stderr)
            assertEquals(listOf(note, THEIRS), gateway.readLines(NoteRefs.DISCUSS, head))
        }
    }

    @Test
    fun `the share drops the forced refspec that an older version wrote`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            check(repo.git.run("config", "--add", "remote.origin.fetch", NotesSharing.FORCED_REFSPEC).ok)
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, note)

            assertTrue(NotesSharing(repo.git).share(NoteRefs.DISCUSS).ok)

            assertTrue(fetchRefspecs(repo).none { it == NotesSharing.FORCED_REFSPEC }, "the forced one must go")
            assertEquals(1, fetchRefspecs(repo).count { it == NotesSharing.FETCH_REFSPEC })
            assertTrue(fetchRefspecs(repo).any { it.startsWith("+refs/heads/") }, "the branch refspec stays")
        }
    }

    /**
     * Git reads the fetch list in order, and the first refspec that matches a ref decides
     * the update. A forced refspec that stays over the safe one therefore still overwrites
     * the local note ref.
     */
    @Test
    fun `a fetch after the repair keeps a note that no push carried`() {
        TempRepo().use { repo ->
            repo.addRemote()
            val head = repo.commit("a.kt", "one")
            check(repo.git.run("config", "--add", "remote.origin.fetch", NotesSharing.FORCED_REFSPEC).ok)
            val gateway = NotesGateway(repo.git)
            val shared = diverge(repo, gateway, head)

            assertFalse(repo.git.run("fetch", "origin").ok)
            assertEquals(listOf(shared, MINE), gateway.readLines(NoteRefs.DISCUSS, head))
        }
    }

    @Test
    fun `a failed push leaves the git configuration alone`() {
        TempRepo().use { repo ->
            val missing = "${repo.dir.absolutePath.replace('\\', '/')}/no-such-remote"
            check(repo.git.run("remote", "add", "origin", missing).ok)
            val head = repo.commit("a.kt", "one")
            NotesGateway(repo.git).append(NoteRefs.DISCUSS, head, note)

            val result = NotesSharing(repo.git).share(NoteRefs.DISCUSS)

            assertFalse(result.ok)
            assertTrue(fetchRefspecs(repo).none { it == NotesSharing.FETCH_REFSPEC }, "a failed push writes nothing")
        }
    }

    /**
     * Shares one note, moves the remote ref on, and then writes a note that no push carried.
     * The answer is the line that both sides hold.
     */
    private fun diverge(repo: TempRepo, gateway: NotesGateway, head: String): String {
        gateway.append(NoteRefs.DISCUSS, head, note)
        assertTrue(NotesSharing(repo.git).share(NoteRefs.DISCUSS).ok)
        val first = repo.git.run("rev-parse", NoteRefs.DISCUSS).stdout.trim()
        gateway.append(NoteRefs.DISCUSS, head, THEIRS)
        assertTrue(NotesSharing(repo.git).share(NoteRefs.DISCUSS).ok)
        check(repo.git.run("update-ref", NoteRefs.DISCUSS, first).ok)
        gateway.append(NoteRefs.DISCUSS, head, MINE)
        return note
    }

    private companion object {
        const val THEIRS = """{"timestamp":"1787194428","author":"other@b.c"}"""

        const val MINE = """{"timestamp":"1787194429","author":"a@b.c"}"""
    }
}
