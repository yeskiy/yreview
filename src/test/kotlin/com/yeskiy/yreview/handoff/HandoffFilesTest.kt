package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskDocument
import com.yeskiy.yreview.tasks.TaskKind
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HandoffFilesTest {

    private val task = ReviewTask(
        id = "firstTask",
        kind = TaskKind.COMMENT,
        path = "src/Parser.kt",
        startLine = 88,
        endLine = 94,
        text = "Add the guard before the loop.",
    )

    private fun document(tasks: List<ReviewTask> = listOf(task)) = TaskDocument(
        repository = "E:/repo",
        commit = "44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900",
        generated = "2026-08-21T02:40:00Z",
        tasks = tasks,
    )

    private fun withFolder(body: (Path) -> Unit) {
        val folder = Files.createTempDirectory("y-review-handoff")
        try {
            body(folder.resolve("y-review"))
        } finally {
            folder.toFile().deleteRecursively()
        }
    }

    @Test
    fun `makes the folder and writes the two files`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document())
            assertTrue(Files.isRegularFile(files.guide))
            assertTrue(Files.isRegularFile(files.tasks))
        }
    }

    @Test
    fun `writes the rules of the agent`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document())
            assertTrue(files.guide.readText().startsWith("# How to work through the review tasks"))
        }
    }

    @Test
    fun `writes the tasks of this send only`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document())
            files.write(document(listOf(task.copy(id = "secondTask"))))
            assertTrue(files.tasks.readText().contains("secondTask"))
            assertFalse(files.tasks.readText().contains("firstTask"))
        }
    }

    @Test
    fun `leaves no temporary file behind`() {
        withFolder { folder ->
            HandoffFiles(folder).write(document())
            assertEquals(3, folder.toFile().listFiles()?.size)
        }
    }

    @Test
    fun `names the done file inside the same folder`() {
        withFolder { folder ->
            assertEquals(folder.resolve("done.txt"), HandoffFiles(folder).done)
        }
    }

    @Test
    fun `makes an empty done file`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document())
            assertTrue(Files.isRegularFile(files.done))
            assertEquals("", files.done.readText())
        }
    }

    @Test
    fun `keeps every line an agent already wrote`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document())
            files.done.writeText("firstTask\n")
            files.write(document())
            assertEquals("firstTask\n", files.done.readText())
        }
    }
}
