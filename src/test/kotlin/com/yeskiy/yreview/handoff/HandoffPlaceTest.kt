package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.store.StoreKind
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HandoffPlaceTest {

    private val root: Path = Path.of("E:/work/api")

    @Test
    fun `a repository keeps the files in the git directory`() {
        assertEquals(
            Path.of("E:/work/api/.git/y-review"),
            HandoffPlace.of(StoreKind.GIT, root, Path.of("E:/work/api/.git")),
        )
    }

    @Test
    fun `a worktree keeps the files where git names the directory`() {
        assertEquals(
            Path.of("E:/work/main/.git/worktrees/api/y-review"),
            HandoffPlace.of(StoreKind.GIT, root, Path.of("E:/work/main/.git/worktrees/api")),
        )
    }

    @Test
    fun `a repository without a git directory has no place`() {
        assertNull(HandoffPlace.of(StoreKind.GIT, root, null))
    }

    @Test
    fun `a folder store keeps the files beside its own records`() {
        assertEquals(Path.of("E:/work/api/.y-review"), HandoffPlace.of(StoreKind.FOLDER, root, null))
    }

    @Test
    fun `a folder store ignores a git directory`() {
        assertEquals(
            Path.of("E:/work/api/.y-review"),
            HandoffPlace.of(StoreKind.FOLDER, root, Path.of("E:/work/api/.git")),
        )
    }
}
