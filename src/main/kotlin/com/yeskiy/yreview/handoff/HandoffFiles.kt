package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.tasks.TaskDocument
import com.yeskiy.yreview.tasks.TaskJson
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption

/**
 * The three files of the file protocol, inside the git directory of one repository.
 *
 * Git never tracks the git directory, so no ignore entry is needed and no review file
 * reaches a commit.
 */
class HandoffFiles(val folder: Path) {

    val guide: Path get() = folder.resolve(AgentGuide.FILE_NAME)

    val tasks: Path get() = folder.resolve(TASKS_NAME)

    val done: Path get() = folder.resolve(DONE_NAME)

    /** Writes the rules and the tasks of one send. An agent may read while the plugin writes. */
    fun write(document: TaskDocument) {
        Files.createDirectories(folder)
        replace(guide, AgentGuide.TEXT + "\n")
        replace(tasks, TaskJson.encode(document) + "\n")
        open(done)
    }

    /**
     * Makes an empty done file when there is none.
     *
     * The plugin names this path in the prompt, so the path has to open. The call writes
     * no byte, and a file that already holds the lines of an agent keeps every one of them.
     */
    private fun open(target: Path) {
        Files.newOutputStream(target, StandardOpenOption.CREATE, StandardOpenOption.APPEND).close()
    }

    private fun replace(target: Path, text: String) {
        val temporary = Files.createTempFile(folder, target.fileName.toString(), ".tmp")
        Files.write(temporary, text.toByteArray(StandardCharsets.UTF_8))
        try {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (unsupported: IOException) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        const val TASKS_NAME = "tasks.json"
        const val DONE_NAME = "done.txt"
    }
}
