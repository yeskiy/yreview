package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskDocument
import com.yeskiy.yreview.tasks.TaskHandles
import com.yeskiy.yreview.tasks.TaskIds
import com.yeskiy.yreview.tasks.TaskKind
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The identifiers that one project window handed to an agent.
 *
 * An agent works in the same folder, so the file is input the plugin does not trust. A file
 * that the reader cannot use answers with nothing, and the caller then proves no hand-out.
 */
class SentTasksTest {

    private val todo = TaskIds.forTodo("src/Main.kt", 12)

    private val comment = "c3f9a12aabbccddeeff00112233445566778899a"

    private fun task(id: String, kind: TaskKind) = ReviewTask(
        id = id,
        kind = kind,
        path = "src/Main.kt",
        startLine = 12,
        endLine = 12,
        text = "TODO: drop this",
    )

    private fun document(tasks: List<ReviewTask>) = TaskDocument(
        repository = "E:/repo",
        commit = "44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900",
        generated = "2026-09-06T02:40:00Z",
        tasks = tasks,
    )

    private fun withFolder(body: (Path) -> Unit) {
        val folder = Files.createTempDirectory("y-review-sent")
        try {
            body(folder.resolve("y-review"))
        } finally {
            folder.toFile().deleteRecursively()
        }
    }

    @Test
    fun `the file names every task of the last send`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(
                document(
                    listOf(
                        task(TaskHandles.of(todo), TaskKind.TODO),
                        task(TaskHandles.of(comment), TaskKind.COMMENT),
                    )
                )
            )

            assertEquals(
                setOf(TaskHandles.of(todo), TaskHandles.of(comment)),
                SentTasks.handles(files.tasks),
            )
        }
    }

    @Test
    fun `a file of an older build answers the handle of a long identifier`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document(listOf(task(todo, TaskKind.TODO))))

            assertEquals(setOf(TaskHandles.of(todo)), SentTasks.handles(files.tasks))
        }
    }

    @Test
    fun `a file that is not there answers nothing`() {
        withFolder { folder ->
            assertEquals(emptySet(), SentTasks.handles(folder.resolve(HandoffFiles.TASKS_NAME)))
        }
    }

    @Test
    fun `a file that no parser accepts answers nothing`() {
        withFolder { folder ->
            Files.createDirectories(folder)
            val file = folder.resolve(HandoffFiles.TASKS_NAME)
            file.writeText("not json at all")

            assertEquals(emptySet(), SentTasks.handles(file))
        }
    }

    @Test
    fun `a file over the cap answers nothing`() {
        withFolder { folder ->
            val files = HandoffFiles(folder)
            files.write(document(listOf(task(TaskHandles.of(todo), TaskKind.TODO))))

            assertEquals(emptySet(), SentTasks.handles(files.tasks, maxBytes = 8))
        }
    }
}
