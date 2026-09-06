package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.store.StoreKind
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HandoffPlaceTest {

    private val root: Path = Path.of("E:/work/api")

    private val gitDir: Path = Path.of("E:/work/api/.git")

    private val window = "E:/work/api"

    @Test
    fun `a repository keeps the files in the git directory`() {
        assertEquals(
            Path.of("E:/work/api/.git/y-review"),
            HandoffPlace.shared(StoreKind.GIT, root, gitDir),
        )
    }

    @Test
    fun `a worktree keeps the files where git names the directory`() {
        assertEquals(
            Path.of("E:/work/main/.git/worktrees/api/y-review"),
            HandoffPlace.shared(StoreKind.GIT, root, Path.of("E:/work/main/.git/worktrees/api")),
        )
    }

    @Test
    fun `a repository without a git directory has no place`() {
        assertNull(HandoffPlace.shared(StoreKind.GIT, root, null))
        assertNull(HandoffPlace.of(StoreKind.GIT, root, null, window))
    }

    @Test
    fun `a folder store keeps the files beside its own records`() {
        assertEquals(Path.of("E:/work/api/.y-review"), HandoffPlace.shared(StoreKind.FOLDER, root, null))
    }

    @Test
    fun `a folder store ignores a git directory`() {
        assertEquals(
            Path.of("E:/work/api/.y-review"),
            HandoffPlace.shared(StoreKind.FOLDER, root, gitDir),
        )
    }

    @Test
    fun `the folder of one window stands inside the folder that every window shares`() {
        assertEquals(
            HandoffPlace.shared(StoreKind.GIT, root, gitDir),
            HandoffPlace.of(StoreKind.GIT, root, gitDir, window)?.parent,
        )
        assertEquals(
            HandoffPlace.shared(StoreKind.FOLDER, root, null),
            HandoffPlace.of(StoreKind.FOLDER, root, null, window)?.parent,
        )
    }

    @Test
    fun `two project windows on one repository get two folders`() {
        assertNotEquals(
            HandoffPlace.of(StoreKind.GIT, root, gitDir, window),
            HandoffPlace.of(StoreKind.GIT, root, gitDir, "E:/work/api/server"),
        )
    }

    @Test
    fun `two folder stores of one root get two folders`() {
        assertNotEquals(
            HandoffPlace.of(StoreKind.FOLDER, root, null, window),
            HandoffPlace.of(StoreKind.FOLDER, root, null, "E:/work/api/server"),
        )
    }

    @Test
    fun `one window keeps one folder`() {
        assertEquals(
            HandoffPlace.of(StoreKind.GIT, root, gitDir, window),
            HandoffPlace.of(StoreKind.GIT, root, gitDir, window),
        )
    }

    @Test
    fun `the name of the folder starts with the name of the project folder`() {
        assertTrue(
            HandoffPlace.of(StoreKind.GIT, root, gitDir, "E:/work/api/server")!!
                .fileName.toString().startsWith("server-"),
        )
    }

    @Test
    fun `a project that names no directory still gets a folder`() {
        assertTrue(
            HandoffPlace.of(StoreKind.GIT, root, gitDir, "")!!.fileName.toString().startsWith("project-"),
        )
    }

    @Test
    fun `the sentence about the files names no fixed git folder`() {
        assertFalse(HandoffPlace.FILES_TEXT.contains(".git"), HandoffPlace.FILES_TEXT)
    }

    @Test
    fun `the sentence about the files names both files and the folder store`() {
        assertTrue(HandoffPlace.FILES_TEXT.contains("AGENT.md"), HandoffPlace.FILES_TEXT)
        assertTrue(HandoffPlace.FILES_TEXT.contains("tasks.json"), HandoffPlace.FILES_TEXT)
        assertTrue(HandoffPlace.FILES_TEXT.contains(".y-review"), HandoffPlace.FILES_TEXT)
    }
}
